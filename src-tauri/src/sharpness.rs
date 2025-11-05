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
