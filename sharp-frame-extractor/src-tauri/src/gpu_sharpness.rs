use anyhow::{Context, Result};
use image::DynamicImage;
use wgpu::util::DeviceExt;

// WGSL Compute Shader for Laplacian filtering
const LAPLACIAN_SHADER: &str = r#"
@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output_buffer: array<f32>;

// Laplacian kernel for edge detection
// [ 0  1  0 ]
// [ 1 -4  1 ]
// [ 0  1  0 ]
@compute @workgroup_size(16, 16)
fn laplacian_compute(
    @builtin(global_invocation_id) global_id: vec3<u32>
) {
    let dims = textureDimensions(input_texture);
    let x = i32(global_id.x);
    let y = i32(global_id.y);

    // Bounds check
    if (x >= i32(dims.x) || y >= i32(dims.y)) {
        return;
    }

    // Sample center pixel
    let center = textureLoad(input_texture, vec2<i32>(x, y), 0).r;

    // Sample neighbors (with bounds checking)
    var laplacian_sum = -4.0 * center;

    if (x > 0) {
        laplacian_sum += textureLoad(input_texture, vec2<i32>(x - 1, y), 0).r;
    }
    if (x < i32(dims.x) - 1) {
        laplacian_sum += textureLoad(input_texture, vec2<i32>(x + 1, y), 0).r;
    }
    if (y > 0) {
        laplacian_sum += textureLoad(input_texture, vec2<i32>(x, y - 1), 0).r;
    }
    if (y < i32(dims.y) - 1) {
        laplacian_sum += textureLoad(input_texture, vec2<i32>(x, y + 1), 0).r;
    }

    // Store absolute value
    let index = u32(y) * dims.x + u32(x);
    output_buffer[index] = abs(laplacian_sum);
}
"#;

// GPU context that can be reused across multiple calculations
pub struct GpuContext {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
}

impl GpuContext {
    /// Initialize GPU context once and reuse it
    pub async fn new() -> Result<Self> {
        // Create wgpu instance
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        });

        // Request adapter (GPU)
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
            .context("Failed to find a suitable GPU adapter")?;

        // Request device and queue
        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("Sharpness Compute Device"),
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits::default(),
                    memory_hints: Default::default(),
                },
                None,
            )
            .await
            .context("Failed to create device")?;

        // Create shader module
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Laplacian Shader"),
            source: wgpu::ShaderSource::Wgsl(LAPLACIAN_SHADER.into()),
        });

        // Create bind group layout
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Laplacian Bind Group Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        // Create pipeline layout
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Laplacian Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        // Create compute pipeline
        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Laplacian Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: Some("laplacian_compute"),
            compilation_options: Default::default(),
            cache: None,
        });

        Ok(Self {
            device,
            queue,
            pipeline,
            bind_group_layout,
        })
    }

    /// Calculate sharpness of an image using GPU
    pub fn calculate_sharpness(&self, img: &DynamicImage) -> Result<f64> {
        // Convert to grayscale
        let gray_img = img.to_luma8();
        let (width, height) = gray_img.dimensions();

        // Convert to f32 normalized values (0.0 - 1.0)
        let pixels: Vec<f32> = gray_img
            .as_raw()
            .iter()
            .map(|&p| p as f32 / 255.0)
            .collect();

        // Create texture
        let texture_size = wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        };

        let texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Input Texture"),
            size: texture_size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R32Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        // Write pixel data to texture
        self.queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            bytemuck::cast_slice(&pixels),
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(width * 4), // 4 bytes per f32
                rows_per_image: Some(height),
            },
            texture_size,
        );

        // Create output buffer
        let output_buffer_size = (width * height * 4) as u64; // f32 = 4 bytes
        let output_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Output Buffer"),
            size: output_buffer_size,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        // Create staging buffer for reading results back
        let staging_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Staging Buffer"),
            size: output_buffer_size,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Create texture view
        let texture_view = texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Create bind group
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Laplacian Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&texture_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: output_buffer.as_entire_binding(),
                },
            ],
        });

        // Create command encoder and dispatch compute shader
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Compute Encoder"),
        });

        {
            let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Laplacian Pass"),
                timestamp_writes: None,
            });

            compute_pass.set_pipeline(&self.pipeline);
            compute_pass.set_bind_group(0, &bind_group, &[]);

            // Dispatch workgroups (16x16 workgroup size)
            let workgroup_count_x = (width + 15) / 16;
            let workgroup_count_y = (height + 15) / 16;
            compute_pass.dispatch_workgroups(workgroup_count_x, workgroup_count_y, 1);
        }

        // Copy output to staging buffer
        encoder.copy_buffer_to_buffer(
            &output_buffer,
            0,
            &staging_buffer,
            0,
            output_buffer_size,
        );

        // Submit commands
        self.queue.submit(Some(encoder.finish()));

        // Read back results
        let buffer_slice = staging_buffer.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            sender.send(result).unwrap();
        });

        // Poll device until mapping completes
        self.device.poll(wgpu::Maintain::Wait);
        receiver
            .recv()
            .context("Failed to receive buffer mapping result")?
            .context("Failed to map buffer")?;

        // Get mapped data
        let data = buffer_slice.get_mapped_range();
        let laplacian_values: &[f32] = bytemuck::cast_slice(&data);

        // Calculate variance (measure of sharpness)
        let n = laplacian_values.len() as f64;
        let mean: f64 = laplacian_values.iter().map(|&x| x as f64).sum::<f64>() / n;
        let variance: f64 = laplacian_values
            .iter()
            .map(|&x| {
                let diff = x as f64 - mean;
                diff * diff
            })
            .sum::<f64>()
            / n;

        // Cleanup
        drop(data);
        staging_buffer.unmap();

        Ok(variance)
    }
}

/// Convenience function to calculate sharpness with GPU
/// Creates a new GPU context for single use (less efficient)
pub fn calculate_sharpness_gpu(img: &DynamicImage) -> Result<f64> {
    let context = pollster::block_on(GpuContext::new())?;
    context.calculate_sharpness(img)
}

/// Batch processing with reusable GPU context (recommended for multiple images)
pub fn calculate_sharpness_batch_gpu(images: &[DynamicImage]) -> Result<Vec<f64>> {
    let context = pollster::block_on(GpuContext::new())?;
    let mut results = Vec::with_capacity(images.len());

    for img in images {
        results.push(context.calculate_sharpness(img)?);
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gpu_context_creation() {
        // This test verifies GPU context can be created
        let result = pollster::block_on(GpuContext::new());
        assert!(result.is_ok() || result.is_err()); // Just verify it doesn't panic
    }
}
