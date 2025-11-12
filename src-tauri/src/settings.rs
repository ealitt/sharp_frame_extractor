use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub first_run: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ffmpeg_path: None,
            ffprobe_path: None,
            first_run: true,
        }
    }
}

impl AppSettings {
    /// Get the settings file path
    fn settings_path() -> Result<PathBuf> {
        let config_dir = dirs::config_dir()
            .context("Failed to get config directory")?;
        let app_dir = config_dir.join("sharp-frame-extractor");
        fs::create_dir_all(&app_dir)?;
        Ok(app_dir.join("settings.json"))
    }

    /// Load settings from disk
    pub fn load() -> Result<Self> {
        let path = Self::settings_path()?;

        if !path.exists() {
            // First run - create default settings
            let settings = Self::default();
            settings.save()?;
            return Ok(settings);
        }

        let contents = fs::read_to_string(&path)?;
        let settings: Self = serde_json::from_str(&contents)?;
        Ok(settings)
    }

    /// Save settings to disk
    pub fn save(&self) -> Result<()> {
        let path = Self::settings_path()?;
        let contents = serde_json::to_string_pretty(self)?;
        fs::write(&path, contents)?;
        Ok(())
    }

    /// Mark first run as complete
    pub fn complete_first_run(&mut self) -> Result<()> {
        self.first_run = false;
        self.save()
    }
}

/// Detects common FFmpeg installation locations
pub fn detect_ffmpeg_paths() -> (Option<PathBuf>, Option<PathBuf>) {
    let mut ffmpeg_path = None;
    let mut ffprobe_path = None;

    #[cfg(target_os = "macos")]
    {
        let homebrew_paths = vec![
            "/opt/homebrew/bin/ffmpeg",      // Apple Silicon Homebrew
            "/usr/local/bin/ffmpeg",          // Intel Homebrew
            "/opt/local/bin/ffmpeg",          // MacPorts
        ];

        for path in homebrew_paths {
            let ffmpeg = PathBuf::from(path);
            let ffprobe = PathBuf::from(path.replace("ffmpeg", "ffprobe"));

            if ffmpeg.exists() && ffprobe.exists() {
                eprintln!("✓ Found FFmpeg at: {}", ffmpeg.display());
                ffmpeg_path = Some(ffmpeg);
                ffprobe_path = Some(ffprobe);
                break;
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let linux_paths = vec![
            "/usr/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/snap/bin/ffmpeg",
        ];

        for path in linux_paths {
            let ffmpeg = PathBuf::from(path);
            let ffprobe = PathBuf::from(path.replace("ffmpeg", "ffprobe"));

            if ffmpeg.exists() && ffprobe.exists() {
                eprintln!("✓ Found FFmpeg at: {}", ffmpeg.display());
                ffmpeg_path = Some(ffmpeg);
                ffprobe_path = Some(ffprobe);
                break;
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Check common Windows installation paths
        let potential_dirs = vec![
            r"C:\Program Files\ffmpeg\bin",
            r"C:\ffmpeg\bin",
            dirs::home_dir().map(|p| p.join(r"scoop\apps\ffmpeg\current\bin")),
            dirs::home_dir().map(|p| p.join(r"AppData\Local\Microsoft\WinGet\Packages")),
        ];

        for dir in potential_dirs.into_iter().flatten() {
            let ffmpeg = dir.join("ffmpeg.exe");
            let ffprobe = dir.join("ffprobe.exe");

            if ffmpeg.exists() && ffprobe.exists() {
                eprintln!("✓ Found FFmpeg at: {}", ffmpeg.display());
                ffmpeg_path = Some(ffmpeg);
                ffprobe_path = Some(ffprobe);
                break;
            }
        }
    }

    // Try system PATH as fallback
    if ffmpeg_path.is_none() {
        use std::process::Command;

        #[cfg(target_os = "windows")]
        let (ffmpeg_cmd, ffprobe_cmd) = ("ffmpeg.exe", "ffprobe.exe");
        #[cfg(not(target_os = "windows"))]
        let (ffmpeg_cmd, ffprobe_cmd) = ("ffmpeg", "ffprobe");

        // Check if ffmpeg works from PATH
        if Command::new(ffmpeg_cmd).arg("-version").output().is_ok() {
            eprintln!("✓ Found FFmpeg in system PATH");
            ffmpeg_path = Some(PathBuf::from(ffmpeg_cmd));
        }

        if Command::new(ffprobe_cmd).arg("-version").output().is_ok() {
            eprintln!("✓ Found FFprobe in system PATH");
            ffprobe_path = Some(PathBuf::from(ffprobe_cmd));
        }
    }

    (ffmpeg_path, ffprobe_path)
}

/// Get platform-specific installation instructions
pub fn get_install_instructions() -> Vec<String> {
    let mut instructions = Vec::new();

    #[cfg(target_os = "macos")]
    {
        instructions.push("Using Homebrew (recommended):".to_string());
        instructions.push("  brew install ffmpeg".to_string());
        instructions.push("".to_string());
        instructions.push("Using MacPorts:".to_string());
        instructions.push("  sudo port install ffmpeg".to_string());
        instructions.push("".to_string());
        instructions.push("Common install locations:".to_string());
        instructions.push("  /opt/homebrew/bin/ffmpeg (Apple Silicon)".to_string());
        instructions.push("  /usr/local/bin/ffmpeg (Intel Mac)".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        instructions.push("Ubuntu/Debian:".to_string());
        instructions.push("  sudo apt update && sudo apt install ffmpeg".to_string());
        instructions.push("".to_string());
        instructions.push("Fedora:".to_string());
        instructions.push("  sudo dnf install ffmpeg".to_string());
        instructions.push("".to_string());
        instructions.push("Arch Linux:".to_string());
        instructions.push("  sudo pacman -S ffmpeg".to_string());
        instructions.push("".to_string());
        instructions.push("Common install locations:".to_string());
        instructions.push("  /usr/bin/ffmpeg".to_string());
        instructions.push("  /usr/local/bin/ffmpeg".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        instructions.push("Using Chocolatey:".to_string());
        instructions.push("  choco install ffmpeg".to_string());
        instructions.push("".to_string());
        instructions.push("Using Scoop:".to_string());
        instructions.push("  scoop install ffmpeg".to_string());
        instructions.push("".to_string());
        instructions.push("Manual download:".to_string());
        instructions.push("  Download from https://ffmpeg.org/download.html".to_string());
        instructions.push("  Extract to C:\\ffmpeg".to_string());
        instructions.push("  Add C:\\ffmpeg\\bin to system PATH".to_string());
        instructions.push("".to_string());
        instructions.push("Common install locations:".to_string());
        instructions.push("  C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe".to_string());
        instructions.push("  C:\\ffmpeg\\bin\\ffmpeg.exe".to_string());
    }

    instructions
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_serialization() {
        let settings = AppSettings::default();
        let json = serde_json::to_string(&settings).unwrap();
        let parsed: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(settings.first_run, parsed.first_run);
    }
}
