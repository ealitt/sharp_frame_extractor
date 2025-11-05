# Sharp Frame Extractor

A high-performance desktop application for extracting the sharpest frames from videos, specifically designed for 3D Gaussian Splatting (3DGS), Neural Radiance Fields (NeRF), and COLMAP dataset preparation.

## Features

- **Drag & Drop Interface**: Simply drag and drop any video file to get started
- **Smart Sharpness Detection**: Uses Laplacian variance algorithm to identify the sharpest frames
- **Visual Analysis**: Interactive bar graph showing sharpness scores for all analyzed frames
- **Customizable Threshold**: Adjust the sharpness threshold to select more or fewer frames
- **Intelligent Frame Selection**: Ensures good temporal distribution with minimum frame distance
- **Multiple Export Formats**: Export as JPEG (smaller files) or PNG (lossless)
- **Automatic COLMAP Optimization**: Suggests optimal threshold and frame count for 3D reconstruction
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Built with Tauri**: Native performance with a modern web UI

## Prerequisites

### Required Software

**FFmpeg** - The application requires FFmpeg to be installed on your system for video processing.

#### macOS
```bash
brew install ffmpeg
```

#### Windows
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH, or use:
```bash
choco install ffmpeg
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt install ffmpeg
```

## Installation

### From Source

1. **Clone the repository**
```bash
git clone <repository-url>
cd sharp-frame-extractor
```

2. **Install dependencies**
```bash
npm install
```

3. **Run in development mode**
```bash
npm run tauri dev
```

4. **Build for production**
```bash
npm run tauri build
```

The built application will be available in `src-tauri/target/release/bundle/`

## Usage

### Basic Workflow

1. **Load Video**
   - Drag and drop a video file into the application, or
   - Click the drop zone to browse for a video file
   - Supported formats: MP4, MOV, AVI, MKV, WebM

2. **Analyze Sharpness**
   - Click "Analyze Video Sharpness" button
   - The application will sample frames and calculate sharpness scores
   - Progress bar shows analysis status
   - Sample rate can be adjusted in settings (default: every 30th frame)

3. **Review Results**
   - View video information (duration, FPS, resolution)
   - Examine the sharpness bar graph
   - Red threshold line shows current selection criteria
   - Hover over bars to see detailed frame information

4. **Adjust Settings**
   - **Sharpness Threshold**: Drag slider to select frames above a certain sharpness score
   - **Export Format**: Choose JPEG (smaller) or PNG (lossless)
   - Click the settings gear icon for advanced options:
     - **Max Frames**: Limit total number of exported frames
     - **Min Frame Distance**: Ensure minimum spacing between selected frames
     - **Sample Rate**: Adjust analysis granularity (re-analyze after changing)

5. **Export Frames**
   - Review the count of frames to be exported
   - Click "Export Selected Frames"
   - Select output directory
   - Frames will be saved as `frame_XXXXXX.jpg` or `frame_XXXXXX.png`

### Tips for 3D Reconstruction

**For COLMAP/3DGS/NeRF:**
- Use the automatically suggested threshold as a starting point
- Aim for 50-150 frames for small objects, 150-500 for scenes
- Ensure good coverage of the subject from different angles
- Set minimum frame distance to avoid too many similar frames
- Use PNG format if you need maximum quality (at cost of file size)
- JPEG with high quality (default) works well for most cases

**Sample Rate:**
- Lower values (10-20): More accurate analysis but slower
- Medium values (30-40): Good balance (recommended)
- Higher values (50-60): Faster but might miss sharp frames

**Frame Selection:**
- Higher threshold = fewer, sharper frames
- Lower threshold = more frames, including slightly blurry ones
- Use the graph to visually identify good threshold values

## Algorithm Details

### Sharpness Detection

The application uses the **Laplacian Variance Method** for blur detection:

1. Converts frames to grayscale
2. Applies a Laplacian operator (edge detection)
3. Calculates variance of the Laplacian values
4. Higher variance = more edges = sharper image

This method is fast, reliable, and well-suited for identifying frames suitable for photogrammetry and 3D reconstruction.

### Smart Frame Selection

The selection algorithm:
1. Filters frames above the sharpness threshold
2. Ensures minimum temporal distance between selected frames
3. If max frames specified, selects the top N sharpest frames
4. Maintains good distribution across the video timeline

## Project Structure

```
sharp-frame-extractor/
├── src/                    # Frontend React/TypeScript code
│   ├── App.tsx            # Main application component
│   ├── types.ts           # TypeScript type definitions
│   └── index.css          # Tailwind CSS styles
├── src-tauri/             # Backend Rust code
│   └── src/
│       ├── commands.rs    # Tauri command handlers
│       ├── video.rs       # Video processing functions
│       ├── sharpness.rs   # Sharpness detection algorithms
│       └── lib.rs         # Application entry point
└── package.json           # Node.js dependencies
```

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Recharts
- **Backend**: Rust, Tauri 2.0
- **Video Processing**: FFmpeg
- **Image Analysis**: Rust `image` crate
- **UI Libraries**:
  - `react-dropzone` for drag & drop
  - `recharts` for data visualization
  - `lucide-react` for icons

## Performance Optimization

The application is optimized for speed:
- Parallel frame analysis using Rayon
- Efficient FFmpeg frame extraction
- Minimal memory footprint
- Native performance via Rust/Tauri

Expected analysis times (1080p video, sample rate 30):
- 1 minute video: ~5-10 seconds
- 5 minute video: ~20-40 seconds
- 10 minute video: ~40-80 seconds

(Times vary based on system performance and video codec)

## Troubleshooting

### FFmpeg Not Found
```
Error: Failed to execute ffprobe/ffmpeg. Make sure FFmpeg is installed.
```
**Solution**: Install FFmpeg and ensure it's in your system PATH.

### Video Won't Load
- Ensure the video file isn't corrupted
- Try converting to MP4 using FFmpeg: `ffmpeg -i input.mov -c copy output.mp4`
- Check file permissions

### Analysis is Slow
- Increase sample rate (analyze fewer frames)
- Try a lower resolution video
- Close other applications to free up CPU

### Export Fails
- Ensure you have write permissions to the selected directory
- Check available disk space
- Try a different output directory

## Building for Distribution

### macOS
```bash
npm run tauri build
# Creates .dmg and .app in src-tauri/target/release/bundle/
```

### Windows
```bash
npm run tauri build
# Creates .msi and .exe in src-tauri/target/release/bundle/
```

### Linux
```bash
npm run tauri build
# Creates .deb, .AppImage in src-tauri/target/release/bundle/
```

## Future Enhancements

Potential features for future releases:
- Bundled FFmpeg (no external installation required)
- Motion blur detection
- Focus stacking support
- Video trimming before analysis
- Batch processing multiple videos
- Export metadata file for COLMAP
- Camera parameter extraction from EXIF

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

[Specify your license here]

## Acknowledgments

Inspired by [Sharp Frames](https://sharp-frames.reflct.app/) for browser-based frame extraction. This desktop application provides native performance, no file size limits, and works offline.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.
