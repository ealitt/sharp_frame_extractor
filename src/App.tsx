import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openPath } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Upload,
  Play,
  Download,
  Settings,
  Info,
  FileVideo,
} from 'lucide-react';
import type {
  AnalysisResult,
  AnalysisProgress,
  ExportOptions,
  ExportFormat,
} from './types';

import './index.css';

function App() {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [threshold, setThreshold] = useState<number>(0);
  const [maxFrames, setMaxFrames] = useState<number | undefined>(undefined);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [minFrameDistance, setMinFrameDistance] = useState<number>(5);
  const [sampleRate, setSampleRate] = useState<number>(1);
  const [useGpu, setUseGpu] = useState<boolean>(true);
  const [exporting, setExporting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const setupListeners = async () => {
      const currentWindow = getCurrentWindow();

      // Listen for analysis progress
      const unlistenProgress = await listen<AnalysisProgress>('analysis-progress', (event) => {
        setProgress(event.payload);
      });

      // Listen for file drop events using Tauri's onDragDropEvent
      const unlistenFileDrop = await currentWindow.onDragDropEvent((event) => {
        console.log('Drag drop event:', event);
        if (event.payload.type === 'drop') {
          const paths = event.payload.paths;
          console.log('Dropped paths:', paths);
          if (paths && paths.length > 0) {
            const filePath = paths[0];
            // Check if it's a video file
            if (filePath.match(/\.(mp4|mov|avi|mkv|webm)$/i)) {
              setVideoPath(filePath);
              setVideoUrl(convertFileSrc(filePath));
              setAnalysisResult(null);
              setProgress(null);
            }
          }
        }
      });

      return () => {
        unlistenProgress();
        unlistenFileDrop();
      };
    };

    const cleanup = setupListeners();
    return () => {
      cleanup.then((fn) => fn());
    };
  }, []);

  const handleBrowseFile = async () => {
    const selected = await openPath({
      multiple: false,
      filters: [{
        name: 'Video',
        extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm']
      }]
    });

    if (selected) {
      setVideoPath(selected as string);
      setVideoUrl(convertFileSrc(selected as string));
      setAnalysisResult(null);
      setProgress(null);
    }
  };

  const analyzeVideo = async () => {
    if (!videoPath) return;

    try {
      setAnalyzing(true);
      setProgress(null);

      const result = await invoke<AnalysisResult>('analyze_video', {
        videoPath,
        sampleRate,
        useGpu,
      });

      setAnalysisResult(result);
      setThreshold(result.suggested_threshold);
    } catch (error) {
      console.error('Analysis failed:', error);
      alert(`Analysis failed: ${error}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const exportFrames = async () => {
    if (!videoPath || !analysisResult) return;

    try {
      setExporting(true);

      // Ask user to select output directory
      const baseDir = await openPath({
        directory: true,
        multiple: false,
      });

      if (!baseDir) {
        setExporting(false);
        return;
      }

      // Create subfolder with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const videoName = videoPath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'video';
      const folderName = `${videoName}_frames_${timestamp}`;
      const outputDir = `${baseDir}/${folderName}`;

      const options: ExportOptions = {
        format: exportFormat,
        threshold: threshold || undefined,
        max_frames: maxFrames,
        min_frame_distance: minFrameDistance,
      };

      const exportedPaths = await invoke<string[]>('export_frames', {
        videoPath,
        outputDir,
        analysisResult,
        options,
      });

      alert(`Successfully exported ${exportedPaths.length} frames to:\n${outputDir}`);
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error}`);
    } finally {
      setExporting(false);
    }
  };

  const getChartData = () => {
    if (!analysisResult) return [];

    return analysisResult.frames.map((frame, idx) => ({
      index: idx,
      frame: frame.frame_number,
      sharpness: Math.round(frame.sharpness * 100) / 100,
      timestamp: frame.timestamp.toFixed(2),
    }));
  };

  const getSelectedFrameCount = () => {
    if (!analysisResult) return 0;

    // Apply the same logic as the backend to show accurate count
    const framesAboveThreshold = analysisResult.frames
      .map((f, idx) => ({ ...f, idx }))
      .filter((f) => f.sharpness >= threshold);

    // Apply min frame distance filter
    const selectedFrames: typeof framesAboveThreshold = [];
    let lastSelected: number | null = null;

    for (const frame of framesAboveThreshold) {
      if (lastSelected === null || frame.idx - lastSelected >= minFrameDistance) {
        selectedFrames.push(frame);
        lastSelected = frame.idx;
      }
    }

    // Apply max frames limit if set
    const finalCount = maxFrames && selectedFrames.length > maxFrames
      ? maxFrames
      : selectedFrames.length;

    return finalCount;
  };

  const renderVideoInfo = () => {
    if (!analysisResult) return null;

    const info = analysisResult.video_info;

    return (
      <div className="card space-y-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Info size={20} />
          Video Information
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Duration:</span> {info.duration.toFixed(2)}s
          </div>
          <div>
            <span className="font-medium">FPS:</span> {info.fps.toFixed(2)}
          </div>
          <div>
            <span className="font-medium">Resolution:</span> {info.width}x{info.height}
          </div>
          <div>
            <span className="font-medium">Total Frames:</span> {info.total_frames}
          </div>
          <div>
            <span className="font-medium">Analyzed:</span> {analysisResult.frames.length}
          </div>
          <div>
            <span className="font-medium">Selected:</span> {getSelectedFrameCount()}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-3">
            <FileVideo size={40} />
            Sharp Frame Extractor
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Extract the sharpest frames from videos for 3D Gaussian Splatting and COLMAP
          </p>
        </div>

        {/* Drag and Drop Zone */}
        {!videoPath && (
          <div
            onClick={handleBrowseFile}
            className="card border-2 border-dashed cursor-pointer transition-all border-gray-300 dark:border-gray-600 hover:border-blue-400"
          >
            <div className="text-center py-12 space-y-4">
              <Upload size={48} className="mx-auto text-gray-400" />
              <div>
                <p className="text-lg font-medium">
                  Drag & drop a video file
                </p>
                <p className="text-sm text-gray-500">or click to browse</p>
              </div>
              <p className="text-xs text-gray-400">
                Supported formats: MP4, MOV, AVI, MKV, WebM
              </p>
            </div>
          </div>
        )}

        {/* Video Player */}
        {videoUrl && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Video Preview</h3>
              <button
                onClick={() => {
                  setVideoPath(null);
                  setVideoUrl(null);
                  setAnalysisResult(null);
                }}
                className="btn-secondary text-sm"
              >
                Remove Video
              </button>
            </div>
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className="w-full rounded-lg bg-black"
              style={{ maxHeight: '400px' }}
            />
            {!analyzing && !analysisResult && (
              <>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg space-y-3">
                  <h4 className="font-semibold text-sm">Analysis Settings</h4>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">
                        Sample Rate: Every {sampleRate === 1 ? '' : sampleRate}{sampleRate === 1 ? 'frame (all)' : sampleRate === 1 ? 'frame' : 'frames'}
                      </label>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {sampleRate === 1 ? 'Most accurate, slower' : sampleRate <= 10 ? 'High accuracy' : sampleRate <= 30 ? 'Balanced' : 'Fast, less accurate'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={60}
                      value={sampleRate}
                      onChange={(e) => setSampleRate(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      Analyzing every {sampleRate === 1 ? '' : `${sampleRate} `}frame{sampleRate === 1 ? '' : 's'}
                      {sampleRate === 1 ? ' (all frames will be analyzed)' : ` (faster analysis, may miss some sharp frames)`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="useGpu"
                      checked={useGpu}
                      onChange={(e) => setUseGpu(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="useGpu" className="text-sm font-medium">
                      Use GPU Acceleration (Metal on Mac, NVIDIA CUDA on Windows/Linux)
                    </label>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {useGpu ? 'GPU acceleration enabled - faster processing' : 'Using CPU only - slower but compatible with all systems'}
                  </p>
                </div>
                <button onClick={analyzeVideo} className="btn-primary w-full">
                  <Play size={20} className="inline mr-2" />
                  Analyze Video Sharpness
                </button>
              </>
            )}
          </div>
        )}

        {/* Analysis Progress */}
        {analyzing && (
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <h3 className="text-lg font-semibold">
                {progress ? 'Analyzing Sharpness...' : 'Extracting Frames...'}
              </h3>
            </div>
            {progress ? (
              <div className="space-y-3">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <p className="text-gray-600 dark:text-gray-400">
                    Frame {progress.current_frame} of {progress.total_frames}
                  </p>
                  <p className="font-semibold text-blue-600 dark:text-blue-400">
                    {progress.percentage.toFixed(1)}%
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    <strong>Note:</strong> Using hardware acceleration (
                    {navigator.platform.includes('Mac') ? 'VideoToolbox' : 'GPU'}) for faster processing
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                  <div className="bg-gray-400 dark:bg-gray-500 h-4 rounded-full animate-pulse w-1/3"></div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Preparing video analysis...
                </p>
              </div>
            )}
          </div>
        )}

        {/* Analysis Results */}
        {analysisResult && (
          <>
            {renderVideoInfo()}

            {/* Sharpness Chart */}
            <div className="card space-y-4">
              <h3 className="text-lg font-semibold">Frame Sharpness Analysis</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="index"
                      label={{ value: 'Frame Index', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis label={{ value: 'Sharpness', angle: -90, position: 'insideLeft' }} />
                    <Tooltip
                      content={({ payload }) => {
                        if (payload && payload.length > 0) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white dark:bg-gray-800 p-2 border border-gray-300 dark:border-gray-600 rounded shadow-lg">
                              <p className="text-sm">
                                <strong>Frame:</strong> {data.frame}
                              </p>
                              <p className="text-sm">
                                <strong>Time:</strong> {data.timestamp}s
                              </p>
                              <p className="text-sm">
                                <strong>Sharpness:</strong> {data.sharpness}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine
                      y={threshold}
                      stroke="red"
                      strokeDasharray="3 3"
                      label={{ value: 'Threshold', position: 'right' }}
                    />
                    <Bar dataKey="sharpness" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Export Controls */}
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Export Settings</h3>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="btn-secondary"
                >
                  <Settings size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Sharpness Threshold: {threshold.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(...analysisResult.frames.map((f) => f.sharpness))}
                    step={0.1}
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Frames above this threshold will be exported
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Export Format</label>
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                    className="input-field w-full"
                  >
                    <option value="jpg">JPEG (smaller file size)</option>
                    <option value="png">PNG (lossless)</option>
                  </select>
                </div>

                {showSettings && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Max Frames (optional)
                      </label>
                      <input
                        type="number"
                        value={maxFrames || ''}
                        onChange={(e) =>
                          setMaxFrames(e.target.value ? parseInt(e.target.value) : undefined)
                        }
                        placeholder="No limit"
                        className="input-field w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Min Frame Distance: {minFrameDistance}
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={30}
                        value={minFrameDistance}
                        onChange={(e) => setMinFrameDistance(parseInt(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Minimum frames between selected frames (prevents too many similar frames)
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <p className="text-sm">
                  <strong>{getSelectedFrameCount()}</strong> frames will be exported with current
                  settings
                </p>
              </div>

              <button
                onClick={exportFrames}
                disabled={exporting}
                className="btn-primary w-full"
              >
                <Download size={20} className="inline mr-2" />
                {exporting ? 'Exporting...' : 'Export Selected Frames'}
              </button>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-gray-500">
          <p>
            Designed for 3D Gaussian Splatting (3DGS) and COLMAP dataset preparation
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
