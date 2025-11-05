use anyhow::{Context, Result};
use image::DynamicImage;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub duration: f64,
    pub fps: f64,
    pub width: u32,
    pub height: u32,
    pub total_frames: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameData {
    pub frame_number: usize,
    pub timestamp: f64,
    pub sharpness: f64,
    pub path: Option<String>,
}

/// Extracts video metadata using ffprobe
pub fn get_video_info(video_path: &Path) -> Result<VideoInfo> {
    let output = Command::new("ffprobe")
        .args([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,duration,nb_frames",
            "-of", "json",
            video_path.to_str().unwrap(),
        ])
        .output()
        .context("Failed to execute ffprobe. Make sure FFmpeg is installed.")?;

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffprobe failed: {}", error);
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .context("Failed to parse ffprobe output")?;

    let stream = &json["streams"][0];

    let width = stream["width"].as_u64().context("Missing width")? as u32;
    let height = stream["height"].as_u64().context("Missing height")? as u32;

    // Parse frame rate (e.g., "30/1" -> 30.0)
    let fps_str = stream["r_frame_rate"].as_str().context("Missing frame rate")?;
    let fps_parts: Vec<&str> = fps_str.split('/').collect();
    let fps = if fps_parts.len() == 2 {
        let num: f64 = fps_parts[0].parse()?;
        let den: f64 = fps_parts[1].parse()?;
        num / den
    } else {
        30.0 // default fallback
    };

    // Get duration (try from stream first, then format)
    let duration = stream["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or_else(|| {
            json["format"]["duration"]
                .as_str()
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0)
        });

    // Calculate total frames
    let total_frames = stream["nb_frames"]
        .as_str()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or_else(|| (duration * fps) as u32);

    Ok(VideoInfo {
        duration,
        fps,
        width,
        height,
        total_frames,
    })
}

/// Detects available hardware acceleration for FFmpeg
fn detect_hw_accel() -> Vec<String> {
    let mut accel_args = Vec::new();

    // Try VideoToolbox (macOS)
    #[cfg(target_os = "macos")]
    {
        accel_args.extend(vec!["-hwaccel".to_string(), "videotoolbox".to_string()]);
        return accel_args;
    }

    // Try CUDA (NVIDIA GPUs on Linux/Windows)
    #[cfg(not(target_os = "macos"))]
    {
        // Check if CUDA is available
        if Command::new("ffmpeg").args(["-hwaccels"]).output()
            .map(|out| String::from_utf8_lossy(&out.stdout).contains("cuda"))
            .unwrap_or(false)
        {
            accel_args.extend(vec!["-hwaccel".to_string(), "cuda".to_string()]);
        }
    }

    accel_args
}

/// Extracts a single frame from a video at the specified frame number
pub fn extract_frame(video_path: &Path, frame_number: usize, output_path: &Path) -> Result<()> {
    // Get video info to calculate timestamp
    let info = get_video_info(video_path)?;
    let timestamp = frame_number as f64 / info.fps;

    // Create output directory if it doesn't exist
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)?;
    }

    // Build command with hardware acceleration
    let mut cmd = Command::new("ffmpeg");
    let hw_accel = detect_hw_accel();

    // Add hardware acceleration args if available
    for arg in &hw_accel {
        cmd.arg(arg);
    }

    // Add remaining args
    cmd.args([
        "-ss", &timestamp.to_string(),
        "-i", video_path.to_str().unwrap(),
        "-vframes", "1",
        "-q:v", "2", // High quality
        "-y", // Overwrite output file
        output_path.to_str().unwrap(),
    ]);

    let output = cmd.output()
        .context("Failed to execute ffmpeg. Make sure FFmpeg is installed.")?;

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffmpeg failed: {}", error);
    }

    Ok(())
}

/// Extracts a frame directly to memory (returns image data)
pub fn extract_frame_to_memory(video_path: &Path, frame_number: usize) -> Result<DynamicImage> {
    // Create temporary file
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("frame_{}.jpg", frame_number));

    // Extract frame to temp file
    extract_frame(video_path, frame_number, &temp_file)?;

    // Load image from temp file
    let img = image::open(&temp_file)
        .context("Failed to load extracted frame")?;

    // Clean up temp file
    let _ = fs::remove_file(&temp_file);

    Ok(img)
}

/// Extracts multiple frames efficiently using a single ffmpeg command
pub fn extract_frames_batch(
    video_path: &Path,
    frame_numbers: &[usize],
    output_dir: &Path,
    format: &str, // "jpg" or "png"
) -> Result<Vec<PathBuf>> {
    fs::create_dir_all(output_dir)?;

    let mut output_paths = Vec::new();

    // Extract frames one by one (can be optimized with ffmpeg select filter)
    for &frame_num in frame_numbers {
        let output_path = output_dir.join(format!("frame_{:06}.{}", frame_num, format));
        extract_frame(video_path, frame_num, &output_path)?;
        output_paths.push(output_path);
    }

    Ok(output_paths)
}

/// Samples frames from a video at regular intervals for analysis
pub fn sample_frames(video_path: &Path, sample_rate: usize) -> Result<Vec<usize>> {
    let info = get_video_info(video_path)?;
    let total_frames = info.total_frames as usize;

    let mut frame_numbers = Vec::new();
    for i in (0..total_frames).step_by(sample_rate) {
        frame_numbers.push(i);
    }

    Ok(frame_numbers)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_video_info_parsing() {
        // This test would require a sample video file
        // For now, it's a placeholder
    }
}
