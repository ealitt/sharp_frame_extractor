use crate::sharpness::{calculate_auto_threshold, calculate_sharpness, select_frames_smart};
use crate::gpu_sharpness::GpuContext;
use crate::video::{
    extract_frame_to_memory, extract_frames_batch, get_video_info, sample_frames, FrameData,
    VideoInfo,
};
use anyhow::Result;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisProgress {
    pub current_frame: usize,
    pub total_frames: usize,
    pub percentage: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub video_info: VideoInfo,
    pub frames: Vec<FrameData>,
    pub suggested_threshold: f64,
    pub suggested_frame_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub format: String, // "jpg" or "png"
    pub threshold: Option<f64>,
    pub max_frames: Option<usize>,
    pub min_frame_distance: usize,
}

/// Analyzes a video and returns sharpness scores for all sampled frames
#[tauri::command]
pub async fn analyze_video(
    video_path: String,
    sample_rate: usize,
    use_gpu: bool,
    window: tauri::Window,
) -> Result<AnalysisResult, String> {
    let path = Path::new(&video_path);

    // Get video information
    let video_info = get_video_info(path).map_err(|e| e.to_string())?;

    // Sample frames to analyze
    let frame_numbers = sample_frames(path, sample_rate).map_err(|e| e.to_string())?;

    let total_frames = frame_numbers.len();
    let progress = Arc::new(Mutex::new(0usize));

    // GPU-accelerated analysis path
    if use_gpu {
        // Initialize GPU context once
        let gpu_context = GpuContext::new()
            .await
            .map_err(|e| format!("Failed to initialize GPU: {}. Falling back to CPU.", e))?;

        let frames: Vec<FrameData> = frame_numbers
            .par_iter()
            .enumerate()
            .map(|(_idx, &frame_num)| {
                // Extract frame and calculate sharpness using GPU
                let result = extract_frame_to_memory(path, frame_num)
                    .and_then(|img| {
                        let sharpness = gpu_context
                            .calculate_sharpness(&img)
                            .unwrap_or_else(|_| calculate_sharpness(&img)); // Fallback to CPU on error
                        Ok(FrameData {
                            frame_number: frame_num,
                            timestamp: frame_num as f64 / video_info.fps,
                            sharpness,
                            path: None,
                        })
                    })
                    .unwrap_or_else(|_| FrameData {
                        frame_number: frame_num,
                        timestamp: frame_num as f64 / video_info.fps,
                        sharpness: 0.0,
                        path: None,
                    });

                // Update progress
                {
                    let mut p = progress.lock().unwrap();
                    *p += 1;
                    let percentage = (*p as f32 / total_frames as f32) * 100.0;

                    // Emit progress event
                    let _ = window.emit(
                        "analysis-progress",
                        AnalysisProgress {
                            current_frame: *p,
                            total_frames,
                            percentage,
                        },
                    );
                }

                result
            })
            .collect();

        // Calculate suggested threshold and frame count
        let sharpness_scores: Vec<f64> = frames.iter().map(|f| f.sharpness).collect();
        let suggested_threshold = calculate_auto_threshold(&sharpness_scores, None);

        let suggested_frame_count = sharpness_scores
            .iter()
            .filter(|&&s| s >= suggested_threshold)
            .count();

        return Ok(AnalysisResult {
            video_info,
            frames,
            suggested_threshold,
            suggested_frame_count,
        });
    }

    // CPU-parallelized analysis path (default)
    let frames: Vec<FrameData> = frame_numbers
        .par_iter()
        .enumerate()
        .map(|(_idx, &frame_num)| {
            // Extract frame and calculate sharpness
            let result = extract_frame_to_memory(path, frame_num)
                .and_then(|img| {
                    let sharpness = calculate_sharpness(&img);
                    Ok(FrameData {
                        frame_number: frame_num,
                        timestamp: frame_num as f64 / video_info.fps,
                        sharpness,
                        path: None,
                    })
                })
                .unwrap_or_else(|_| FrameData {
                    frame_number: frame_num,
                    timestamp: frame_num as f64 / video_info.fps,
                    sharpness: 0.0,
                    path: None,
                });

            // Update progress
            {
                let mut p = progress.lock().unwrap();
                *p += 1;
                let percentage = (*p as f32 / total_frames as f32) * 100.0;

                // Emit progress event
                let _ = window.emit(
                    "analysis-progress",
                    AnalysisProgress {
                        current_frame: *p,
                        total_frames,
                        percentage,
                    },
                );
            }

            result
        })
        .collect();

    // Calculate suggested threshold and frame count
    let sharpness_scores: Vec<f64> = frames.iter().map(|f| f.sharpness).collect();
    let suggested_threshold = calculate_auto_threshold(&sharpness_scores, None);

    // Count frames above threshold
    let suggested_frame_count = sharpness_scores
        .iter()
        .filter(|&&s| s >= suggested_threshold)
        .count();

    Ok(AnalysisResult {
        video_info,
        frames,
        suggested_threshold,
        suggested_frame_count,
    })
}

/// Exports selected frames based on the provided options
#[tauri::command]
pub async fn export_frames(
    video_path: String,
    output_dir: String,
    analysis_result: AnalysisResult,
    options: ExportOptions,
    _window: tauri::Window,
) -> Result<Vec<String>, String> {
    let video_path = Path::new(&video_path);
    let output_dir = Path::new(&output_dir);

    // Determine threshold
    let threshold = options
        .threshold
        .unwrap_or(analysis_result.suggested_threshold);

    // Get sharpness scores
    let sharpness_scores: Vec<f64> = analysis_result.frames.iter().map(|f| f.sharpness).collect();

    // Select frames using smart selection
    let selected_indices = select_frames_smart(
        &sharpness_scores,
        threshold,
        options.min_frame_distance,
    );

    // Limit to max_frames if specified
    let selected_indices: Vec<usize> = if let Some(max) = options.max_frames {
        // Sort by sharpness and take top N
        let mut indexed_scores: Vec<(usize, f64)> = selected_indices
            .iter()
            .map(|&idx| (idx, sharpness_scores[idx]))
            .collect();
        indexed_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        indexed_scores.truncate(max);
        indexed_scores.into_iter().map(|(idx, _)| idx).collect()
    } else {
        selected_indices
    };

    // Get actual frame numbers
    let frame_numbers: Vec<usize> = selected_indices
        .iter()
        .map(|&idx| analysis_result.frames[idx].frame_number)
        .collect();

    // Export frames
    let output_paths = extract_frames_batch(video_path, &frame_numbers, output_dir, &options.format)
        .map_err(|e| e.to_string())?;

    // Convert paths to strings
    let path_strings: Vec<String> = output_paths
        .into_iter()
        .filter_map(|p| p.to_str().map(String::from))
        .collect();

    Ok(path_strings)
}

/// Gets video metadata without full analysis
#[tauri::command]
pub async fn get_video_metadata(video_path: String) -> Result<VideoInfo, String> {
    let path = Path::new(&video_path);
    get_video_info(path).map_err(|e| e.to_string())
}

/// Calculates a custom threshold based on desired frame count
#[tauri::command]
pub fn calculate_threshold_for_count(
    sharpness_scores: Vec<f64>,
    target_count: usize,
) -> Result<f64, String> {
    Ok(calculate_auto_threshold(&sharpness_scores, Some(target_count)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_options() {
        let options = ExportOptions {
            format: "jpg".to_string(),
            threshold: Some(100.0),
            max_frames: Some(50),
            min_frame_distance: 5,
        };

        assert_eq!(options.format, "jpg");
    }
}
