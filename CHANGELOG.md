# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-01-XX

### Added
- **FFmpeg Settings System**: Complete settings management for FFmpeg configuration
  - First-run setup dialog with auto-detection
  - Manual path configuration with file browser
  - Real-time path validation
  - Platform-specific installation instructions
  - Settings persistence across app restarts
- **Auto-Detection**: Intelligent FFmpeg detection for common install locations
  - macOS: Homebrew (Apple Silicon & Intel), MacPorts
  - Linux: apt, dnf, pacman installations
  - Windows: Chocolatey, Scoop, manual installations
- **Settings UI**: New SettingsDialog component
  - Auto-detect button
  - Manual path input with validation
  - Installation instructions panel
  - Visual feedback (checkmarks/alerts)
- **Backend Commands**: 5 new Tauri commands
  - `get_settings` - Load saved settings
  - `save_settings` - Persist settings
  - `detect_ffmpeg` - Auto-detect installation
  - `validate_ffmpeg_path` - Test binary execution
  - `get_ffmpeg_install_instructions` - Platform help
- Settings button in app header
- Cross-platform config directory support via `dirs` crate

### Changed
- FFmpeg path resolution now prioritizes user settings
- Improved error messages directing users to Settings
- Updated product name to "Sharp Frame Extractor" (capitalized)
- Better first-run user experience

### Fixed
- FFmpeg not found in production builds
- Video duration not loading in production
- Analysis failures due to missing FFprobe
- Removed unreliable auto-download approach

### Removed
- Unused `ffmpeg-sidecar` auto-download functionality
- Excessive diagnostic logging

## [0.1.0] - 2025-01-XX

### Added
- Initial release
- Video frame extraction with sharpness analysis
- GPU-accelerated sharpness calculation
- Multiple frame selection modes:
  - Threshold-based selection
  - Batch selection
  - Best N frames
  - Top percentage
  - Manual selection
- Time range filtering
- Drag-and-drop video loading
- Frame preview with modal view
- Export to PNG/JPG formats
- Dark mode support
- Comprehensive video information display
- Progress tracking for analysis and export
- Sample rate configuration
- Min frame distance setting
- Interactive sharpness distribution chart
