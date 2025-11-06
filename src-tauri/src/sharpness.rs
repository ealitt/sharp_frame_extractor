//! # Image Quality Metrics for 3D Reconstruction
//!
//! This module provides image quality assessment for selecting optimal frames
//! for 3D reconstruction pipelines (COLMAP, Gaussian Splatting, NeRF).
//!
//! ## Currently Implemented
//!
//! ### Laplacian Variance (Sharpness)
//! - Detects blur by measuring high-frequency content (edges)
//! - Essential for avoiding motion blur and defocus
//! - Most critical metric for 3D reconstruction quality
//!
//! ## Recommended Additional Metrics for Future Implementation
//!
//! Based on research in photogrammetry and 3D reconstruction, the following
//! metrics would significantly improve frame selection quality:
//!
//! ### 1. Feature Detection Density (HIGH PRIORITY)
//! - **Metric**: Count of SIFT/SURF/ORB keypoints per image
//! - **Why**: COLMAP relies on feature matching between images
//! - **Implementation**: Use opencv-rust or imageproc for feature detection
//! - **Threshold**: Images with <100 features often fail in SfM
//! - **Research**: SIFT features are invariant to rotation, scale, illumination
//!
//! ### 2. Exposure Quality (HIGH PRIORITY)
//! - **Metric**: Histogram distribution and dynamic range
//! - **Why**: Over/under-exposed images lack texture information
//! - **Implementation**: Analyze histogram mean, std dev, and clipping
//! - **Threshold**: Reject if >5% pixels are clipped (0 or 255)
//! - **Research**: Histogram should be centered for optimal reconstruction
//!
//! ### 3. Texture Richness (MEDIUM PRIORITY)
//! - **Metric**: Local standard deviation or entropy
//! - **Why**: Low-texture regions (walls, sky) fail to match
//! - **Implementation**: Calculate entropy or variance in patches
//! - **Threshold**: Reject images with <30% high-variance regions
//! - **Research**: Texture density critical for feature extraction
//!
//! ### 4. Motion Blur Detection (MEDIUM PRIORITY)
//! - **Metric**: Directional gradient analysis or FFT
//! - **Why**: Motion blur different from defocus blur
//! - **Implementation**: Analyze gradient directionality
//! - **Threshold**: High directional bias indicates motion blur
//! - **Research**: Camera-induced vs object-induced blur distinction
//!
//! ### 5. Brightness Consistency (LOW PRIORITY)
//! - **Metric**: Mean luminance across sequence
//! - **Why**: Large exposure changes affect feature matching
//! - **Implementation**: Track mean brightness, flag outliers
//! - **Threshold**: Reject if >2 std dev from sequence mean
//! - **Research**: Consistent lighting improves reconstruction
//!
//! ### 6. Color/Contrast Quality (LOW PRIORITY)
//! - **Metric**: RMS contrast or color variance
//! - **Why**: Low contrast reduces feature distinctiveness
//! - **Implementation**: Calculate global and local contrast
//! - **Threshold**: Minimum contrast ratio of 20:1
//!
//! ## Integration Strategy
//!
//! 1. **Phase 1**: Add feature detection density (biggest impact)
//! 2. **Phase 2**: Add exposure analysis (prevents common failures)
//! 3. **Phase 3**: Add texture richness and motion blur
//! 4. **Phase 4**: Add brightness consistency across sequence
//!
//! ## Dependencies Needed
//!
//! - `opencv-rust` or `imageproc`: Feature detection (SIFT, SURF, ORB)
//! - `image`: Already included (for histogram, entropy)
//! - `rustfft`: For frequency-domain analysis (motion blur)
//!
//! ## Performance Considerations
//!
//! - Feature detection is expensive: ~50-200ms per frame
//! - Can reuse features computed by COLMAP later
//! - Consider GPU acceleration for feature detection
//! - Histogram analysis is fast: ~1-5ms per frame
//!
//! ## Research References
//!
//! - "Key-Point-Descriptor-Based Image Quality Evaluation" (MDPI 2024)
//! - "3D Gaussian Splatting for Real-Time Radiance Field Rendering"
//! - "Performance Analysis of SIFT Operator in Photogrammetric Applications"
//! - COLMAP documentation on image quality requirements

use image::{DynamicImage, GrayImage};

/// Calculates the sharpness of an image using the Laplacian variance method.
/// Higher values indicate sharper images.
/// This is the most common method for blur detection and works well for
/// identifying sharp frames suitable for 3D reconstruction (COLMAP, NeRF, 3DGS).
pub fn calculate_sharpness(img: &DynamicImage) -> f64 {
    let gray_img = img.to_luma8();
    laplacian_variance(&gray_img)
}

/// Computes the variance of the Laplacian of a grayscale image.
/// The Laplacian operator highlights regions of rapid intensity change,
/// which correspond to edges. A sharp image has more high-frequency content
/// and thus a higher Laplacian variance.
fn laplacian_variance(img: &GrayImage) -> f64 {
    let (width, height) = img.dimensions();

    if width < 3 || height < 3 {
        return 0.0;
    }

    let mut laplacian_values = Vec::with_capacity((width * height) as usize);

    // Apply Laplacian kernel (using 3x3 kernel)
    // [ 0  1  0 ]
    // [ 1 -4  1 ]
    // [ 0  1  0 ]
    for y in 1..height - 1 {
        for x in 1..width - 1 {
            let center = img.get_pixel(x, y)[0] as i32;
            let top = img.get_pixel(x, y - 1)[0] as i32;
            let bottom = img.get_pixel(x, y + 1)[0] as i32;
            let left = img.get_pixel(x - 1, y)[0] as i32;
            let right = img.get_pixel(x + 1, y)[0] as i32;

            let laplacian = top + bottom + left + right - 4 * center;
            laplacian_values.push(laplacian as f64);
        }
    }

    // Calculate variance of Laplacian values
    if laplacian_values.is_empty() {
        return 0.0;
    }

    let mean: f64 = laplacian_values.iter().sum::<f64>() / laplacian_values.len() as f64;
    let variance: f64 = laplacian_values
        .iter()
        .map(|&x| (x - mean).powi(2))
        .sum::<f64>()
        / laplacian_values.len() as f64;

    variance
}

/// Determines an automatic threshold for frame selection based on sharpness scores.
/// This uses statistical analysis to find frames that are significantly sharper
/// than the mean, which is suitable for COLMAP and 3D reconstruction.
pub fn calculate_auto_threshold(sharpness_scores: &[f64], target_frame_count: Option<usize>) -> f64 {
    if sharpness_scores.is_empty() {
        return 0.0;
    }

    if let Some(count) = target_frame_count {
        // If a target frame count is specified, find the threshold that gives approximately that many frames
        let mut sorted_scores = sharpness_scores.to_vec();
        sorted_scores.sort_by(|a, b| b.partial_cmp(a).unwrap());

        let index = count.min(sorted_scores.len() - 1);
        return sorted_scores[index];
    }

    // Otherwise, use statistical method: mean + 0.5 * standard deviation
    // This typically selects the top 30-40% of frames
    let mean: f64 = sharpness_scores.iter().sum::<f64>() / sharpness_scores.len() as f64;
    let variance: f64 = sharpness_scores
        .iter()
        .map(|&x| (x - mean).powi(2))
        .sum::<f64>()
        / sharpness_scores.len() as f64;
    let std_dev = variance.sqrt();

    mean + 0.5 * std_dev
}

/// Selects frames that meet the sharpness threshold and ensures good temporal distribution.
/// This helps avoid selecting too many similar frames in a row.
pub fn select_frames_smart(
    sharpness_scores: &[f64],
    threshold: f64,
    min_frame_distance: usize,
) -> Vec<usize> {
    let mut selected_frames = Vec::new();
    let mut last_selected: Option<usize> = None;

    for (idx, &score) in sharpness_scores.iter().enumerate() {
        if score >= threshold {
            // Check minimum distance from last selected frame
            if let Some(last) = last_selected {
                if idx - last < min_frame_distance {
                    continue;
                }
            }

            selected_frames.push(idx);
            last_selected = Some(idx);
        }
    }

    selected_frames
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sharpness_calculation() {
        // Create a simple test image
        let img = DynamicImage::new_luma8(10, 10);
        let sharpness = calculate_sharpness(&img);
        assert!(sharpness >= 0.0);
    }

    #[test]
    fn test_auto_threshold() {
        let scores = vec![10.0, 20.0, 30.0, 40.0, 50.0];
        let threshold = calculate_auto_threshold(&scores, None);
        assert!(threshold > 0.0);
    }
}
