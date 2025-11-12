use anyhow::{Context, Result};
use image::DynamicImage;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::fs;
use std::sync::OnceLock;
use crate::settings::AppSettings;

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

// Cache for FFmpeg binary paths to avoid repeated lookups
static FFMPEG_PATH: OnceLock<PathBuf> = OnceLock::new();
static FFPROBE_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Finds the FFmpeg binary path
fn find_ffmpeg_binary() -> Result<PathBuf> {
    eprintln!("\n=== Looking for FFmpeg ===");

    // 1. Check user settings first
    if let Ok(settings) = AppSettings::load() {
        if let Some(custom_path) = settings.ffmpeg_path {
            let path = PathBuf::from(&custom_path);
            eprintln!("1. Checking custom path from settings: {}", path.display());

            if path.exists() {
                // Test if it works
                if let Ok(output) = Command::new(&path).arg("-version").output() {
                    if output.status.success() {
                        eprintln!("   ✓ Custom FFmpeg path is valid and working");
                        return Ok(path);
                    } else {
                        eprintln!("   ✗ Custom FFmpeg path exists but failed to execute");
                    }
                } else {
                    eprintln!("   ✗ Custom FFmpeg path is not executable");
                }
            } else {
                eprintln!("   ✗ Custom FFmpeg path does not exist");
            }
        }
    }

    // 2. Auto-detect using settings module
    eprintln!("2. Auto-detecting FFmpeg installation...");
    let (detected_ffmpeg, _) = crate::settings::detect_ffmpeg_paths();
    if let Some(path) = detected_ffmpeg {
        eprintln!("   ✓ Found FFmpeg at: {}", path.display());
        return Ok(path);
    } else {
        eprintln!("   ✗ Auto-detection failed");
    }

    // 3. Fall back to system PATH
    eprintln!("3. Falling back to system PATH");

    #[cfg(target_os = "windows")]
    let ffmpeg_cmd = "ffmpeg.exe";
    #[cfg(not(target_os = "windows"))]
    let ffmpeg_cmd = "ffmpeg";

    if let Ok(output) = Command::new(ffmpeg_cmd).arg("-version").output() {
        if output.status.success() {
            eprintln!("   ✓ System FFmpeg found and working");
            return Ok(PathBuf::from(ffmpeg_cmd));
        }
    }

    eprintln!("   ✗ System FFmpeg not found or not working");
    eprintln!("\n⚠ ERROR: Could not find working FFmpeg binary!");
    eprintln!("Please configure FFmpeg path in Settings or install it:");
    eprintln!("  macOS: brew install ffmpeg");
    eprintln!("  Linux: sudo apt install ffmpeg");
    eprintln!("  Windows: choco install ffmpeg");

    anyhow::bail!("FFmpeg not found. Please install FFmpeg or configure the path in Settings.")
}

/// Finds the FFprobe binary path
fn find_ffprobe_binary() -> Result<PathBuf> {
    eprintln!("\n=== Looking for FFprobe ===");

    // 1. Check user settings first
    if let Ok(settings) = AppSettings::load() {
        if let Some(custom_path) = settings.ffprobe_path {
            let path = PathBuf::from(&custom_path);
            eprintln!("1. Checking custom path from settings: {}", path.display());

            if path.exists() {
                // Test if it works
                if let Ok(output) = Command::new(&path).arg("-version").output() {
                    if output.status.success() {
                        eprintln!("   ✓ Custom FFprobe path is valid and working");
                        return Ok(path);
                    } else {
                        eprintln!("   ✗ Custom FFprobe path exists but failed to execute");
                    }
                } else {
                    eprintln!("   ✗ Custom FFprobe path is not executable");
                }
            } else {
                eprintln!("   ✗ Custom FFprobe path does not exist");
            }
        }
    }

    // 2. Auto-detect using settings module
    eprintln!("2. Auto-detecting FFprobe installation...");
    let (_, detected_ffprobe) = crate::settings::detect_ffmpeg_paths();
    if let Some(path) = detected_ffprobe {
        eprintln!("   ✓ Found FFprobe at: {}", path.display());
        return Ok(path);
    } else {
        eprintln!("   ✗ Auto-detection failed");
    }

    // 3. Fall back to system PATH
    eprintln!("3. Falling back to system PATH");

    #[cfg(target_os = "windows")]
    let ffprobe_cmd = "ffprobe.exe";
    #[cfg(not(target_os = "windows"))]
    let ffprobe_cmd = "ffprobe";

    if let Ok(output) = Command::new(ffprobe_cmd).arg("-version").output() {
        if output.status.success() {
            eprintln!("   ✓ System FFprobe found and working");
            return Ok(PathBuf::from(ffprobe_cmd));
        }
    }

    eprintln!("   ✗ System FFprobe not found or not working");
    eprintln!("\n⚠ ERROR: Could not find working FFprobe binary!");
    eprintln!("Please configure FFprobe path in Settings or install it:");
    eprintln!("  macOS: brew install ffmpeg");
    eprintln!("  Linux: sudo apt install ffmpeg");
    eprintln!("  Windows: choco install ffmpeg");

    anyhow::bail!("FFprobe not found. Please install FFmpeg or configure the path in Settings.")
}

/// Gets or initializes the FFmpeg binary path
fn get_ffmpeg_path() -> Result<PathBuf> {
    // Try to get cached path
    if let Some(path) = FFMPEG_PATH.get() {
        return Ok(path.clone());
    }

    // Find and cache the path
    let path = find_ffmpeg_binary()?;
    let _ = FFMPEG_PATH.set(path.clone());
    Ok(path)
}

/// Gets or initializes the FFprobe binary path
fn get_ffprobe_path() -> Result<PathBuf> {
    // Try to get cached path
    if let Some(path) = FFPROBE_PATH.get() {
        return Ok(path.clone());
    }

    // Find and cache the path
    let path = find_ffprobe_binary()?;
    let _ = FFPROBE_PATH.set(path.clone());
    Ok(path)
}

/// Extracts video metadata using ffprobe
pub fn get_video_info(video_path: &Path) -> Result<VideoInfo> {
    let ffprobe_path = get_ffprobe_path()?;
    let output = Command::new(&ffprobe_path)
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
    }

    // Try CUDA (NVIDIA GPUs on Linux/Windows)
    #[cfg(not(target_os = "macos"))]
    {
        // Check if CUDA is available
        if let Ok(ffmpeg_path) = get_ffmpeg_path() {
            if Command::new(&ffmpeg_path).args(["-hwaccels"]).output()
                .map(|out| String::from_utf8_lossy(&out.stdout).contains("cuda"))
                .unwrap_or(false)
            {
                accel_args.extend(vec!["-hwaccel".to_string(), "cuda".to_string()]);
            }
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
    let ffmpeg_path = get_ffmpeg_path()?;
    let mut cmd = Command::new(&ffmpeg_path);
    let hw_accel = detect_hw_accel();

    // Add hardware acceleration args if available
    for arg in &hw_accel {
        cmd.arg(arg);
    }

    // Add remaining args with threading support
    cmd.args([
        "-threads", "1", // One thread per FFmpeg instance (we parallelize at process level)
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

/// Extracts multiple frames in a single FFmpeg call for better performance
pub fn extract_frames_to_memory_batch(
    video_path: &Path,
    frame_numbers: &[usize],
) -> Result<Vec<DynamicImage>> {
    let temp_dir = std::env::temp_dir();
    let batch_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let temp_output_dir = temp_dir.join(format!("frame_batch_{}", batch_id));
    fs::create_dir_all(&temp_output_dir)?;

    // Create a filter expression for selecting specific frames
    let select_expr = frame_numbers
        .iter()
        .map(|&frame_num| format!("eq(n\\,{})", frame_num))
        .collect::<Vec<_>>()
        .join("+");

    // Build command with hardware acceleration
    let ffmpeg_path = get_ffmpeg_path()?;
    let mut cmd = Command::new(&ffmpeg_path);
    let hw_accel = detect_hw_accel();

    // Add hardware acceleration args
    for arg in &hw_accel {
        cmd.arg(arg);
    }

    // Extract all frames in one go using select filter
    cmd.args([
        "-i", video_path.to_str().unwrap(),
        "-vf", &format!("select='{}'", select_expr),
        "-vsync", "0",
        "-q:v", "2",
        "-f", "image2",
        &format!("{}/frame_%06d.jpg", temp_output_dir.display()),
    ]);

    let output = cmd.output()
        .context("Failed to execute ffmpeg batch extraction")?;

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffmpeg batch extraction failed: {}", error);
    }

    // Load all extracted frames
    let mut images = Vec::new();
    let entries = fs::read_dir(&temp_output_dir)?;
    let mut paths: Vec<_> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|ext| ext == "jpg").unwrap_or(false))
        .collect();

    paths.sort(); // Ensure correct order

    for path in &paths {
        let img = image::open(path)
            .context("Failed to load extracted frame")?;
        images.push(img);
    }

    // Clean up temp directory
    let _ = fs::remove_dir_all(&temp_output_dir);

    Ok(images)
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
/// Optionally filters to a specific time range (in seconds)
pub fn sample_frames(
    video_path: &Path,
    sample_rate: usize,
    start_time: Option<f64>,
    end_time: Option<f64>,
) -> Result<Vec<usize>> {
    let info = get_video_info(video_path)?;
    let total_frames = info.total_frames as usize;

    // Calculate frame range from time range
    let start_frame = start_time
        .map(|t| (t * info.fps).floor() as usize)
        .unwrap_or(0)
        .min(total_frames.saturating_sub(1));

    let end_frame = end_time
        .map(|t| (t * info.fps).ceil() as usize)
        .unwrap_or(total_frames)
        .min(total_frames);

    let mut frame_numbers = Vec::new();
    for i in (start_frame..end_frame).step_by(sample_rate) {
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
