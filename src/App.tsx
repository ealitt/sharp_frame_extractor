import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openPath } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  BarChart,
  Bar,
  Cell,
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
  X,
  Check,
  RotateCcw,
  Clock,
} from 'lucide-react';
import type {
  AnalysisResult,
  AnalysisProgress,
  ExportOptions,
  ExportFormat,
  SelectionMode,
  SelectionSettings,
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
  const [minFrameDistance, setMinFrameDistance] = useState<number>(1);
  const [sampleRate, setSampleRate] = useState<number>(1);
  const [useGpu, setUseGpu] = useState<boolean>(true);
  const [exporting, setExporting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Frame selection state
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('threshold');
  const [selectionSettings, setSelectionSettings] = useState<SelectionSettings>({
    mode: 'threshold',
    batchSize: 3,
    batchBuffer: 1,
    bestN: 50,
    topPercentage: 10,
  });
  const [manuallySelectedFrames, setManuallySelectedFrames] = useState<Set<number>>(new Set());

  // Frame preview modal state
  const [previewFrame, setPreviewFrame] = useState<number | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Time range state
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [draggingSlider, setDraggingSlider] = useState<'start' | 'end' | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const setupListeners = async () => {
      const currentWindow = getCurrentWindow();

      // Listen for analysis progress
      const unlistenProgress = await listen<AnalysisProgress>('analysis-progress', (event) => {
        setProgress(event.payload);
      });

      // Listen for file drop events using Tauri's onDragDropEvent
      const unlistenFileDrop = await currentWindow.onDragDropEvent(async (event) => {
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
              setManuallySelectedFrames(new Set());

              // Get video info to set initial time range
              try {
                const info = await invoke<any>('get_video_metadata', { videoPath: filePath });
                setVideoDuration(info.duration);
                setStartTime(0);
                setEndTime(info.duration);
              } catch (error) {
                console.error('Failed to get video metadata:', error);
              }
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
      const filePath = selected as string;
      setVideoPath(filePath);
      setVideoUrl(convertFileSrc(filePath));
      setAnalysisResult(null);
      setProgress(null);
      setManuallySelectedFrames(new Set());

      // Get video info to set initial time range
      try {
        const info = await invoke<any>('get_video_metadata', { videoPath: filePath });
        setVideoDuration(info.duration);
        setStartTime(0);
        setEndTime(info.duration);
      } catch (error) {
        console.error('Failed to get video metadata:', error);
      }
    }
  };

  const analyzeVideo = async () => {
    if (!videoPath) return;

    try {
      setAnalyzing(true);
      setProgress(null);

      // Pass time range to backend if set (null if using full video)
      const result = await invoke<AnalysisResult>('analyze_video', {
        videoPath,
        sampleRate,
        useGpu,
        startTime: startTime > 0 || endTime > 0 ? startTime : null,
        endTime: startTime > 0 || endTime > 0 ? endTime : null,
      });

      setAnalysisResult(result);
      setThreshold(result.suggested_threshold);
      setSelectionSettings(prev => ({ ...prev, mode: 'threshold' }));
      setSelectionMode('threshold');
    } catch (error) {
      console.error('Analysis failed:', error);
      alert(`Analysis failed: ${error}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReset = () => {
    setVideoPath(null);
    setVideoUrl(null);
    setAnalysisResult(null);
    setProgress(null);
    setThreshold(0);
    setMaxFrames(undefined);
    setMinFrameDistance(1);
    setSampleRate(1);
    setExporting(false);
    setShowSettings(false);
    setSelectionMode('threshold');
    setSelectionSettings({
      mode: 'threshold',
      batchSize: 3,
      batchBuffer: 1,
      bestN: 50,
      topPercentage: 10,
    });
    setManuallySelectedFrames(new Set());
    setPreviewFrame(null);
    setPreviewImageUrl(null);
    setVideoDuration(0);
    setStartTime(0);
    setEndTime(0);
  };

  const handleFrameClick = async (frameIndex: number) => {
    if (!analysisResult || !videoPath) return;

    const frame = analysisResult.frames[frameIndex];
    setPreviewFrame(frameIndex);
    setLoadingPreview(true);
    setPreviewImageUrl(null);

    try {
      const imageData = await invoke<string>('get_frame_preview', {
        videoPath,
        frameNumber: frame.frame_number,
      });
      setPreviewImageUrl(imageData);
    } catch (error) {
      console.error('Failed to load frame preview:', error);
      alert(`Failed to load preview: ${error}`);
      setPreviewFrame(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const toggleManualSelection = (frameIndex: number) => {
    setManuallySelectedFrames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(frameIndex)) {
        newSet.delete(frameIndex);
      } else {
        newSet.add(frameIndex);
      }
      return newSet;
    });
  };

  const getSelectedFrameIndices = (): number[] => {
    if (!analysisResult) return [];

    const sharpnessScores = analysisResult.frames.map(f => f.sharpness);

    switch (selectionMode) {
      case 'manual':
        return Array.from(manuallySelectedFrames).sort((a, b) => a - b);

      case 'batch': {
        // Select best frame from each batch
        const { batchSize, batchBuffer } = selectionSettings;
        const selected: number[] = [];
        let i = 0;

        while (i < analysisResult.frames.length) {
          const batchEnd = Math.min(i + batchSize, analysisResult.frames.length);
          const batchScores = sharpnessScores.slice(i, batchEnd);
          const maxIdx = batchScores.indexOf(Math.max(...batchScores));
          selected.push(i + maxIdx);
          i = batchEnd + batchBuffer;
        }

        return selected.sort((a, b) => a - b);
      }

      case 'bestN': {
        // Select top N frames by sharpness
        const indexed = sharpnessScores.map((score, idx) => ({ score, idx }));
        indexed.sort((a, b) => b.score - a.score);
        return indexed.slice(0, selectionSettings.bestN).map(item => item.idx).sort((a, b) => a - b);
      }

      case 'topPercentage': {
        // Select top X% of frames by sharpness
        const count = Math.ceil(analysisResult.frames.length * selectionSettings.topPercentage / 100);
        const indexed = sharpnessScores.map((score, idx) => ({ score, idx }));
        indexed.sort((a, b) => b.score - a.score);
        return indexed.slice(0, count).map(item => item.idx).sort((a, b) => a - b);
      }

      case 'threshold':
      default: {
        // Threshold-based selection
        let framesAboveThreshold = analysisResult.frames
          .map((f, idx) => ({ ...f, idx }))
          .filter((f) => f.sharpness >= threshold);

        // Only apply min distance if it's greater than 1
        if (minFrameDistance > 1) {
          const selectedFrames: typeof framesAboveThreshold = [];
          let lastSelected: number | null = null;

          for (const frame of framesAboveThreshold) {
            if (lastSelected === null || frame.idx - lastSelected >= minFrameDistance) {
              selectedFrames.push(frame);
              lastSelected = frame.idx;
            }
          }
          framesAboveThreshold = selectedFrames;
        }

        // Apply max frames limit if set
        if (maxFrames && framesAboveThreshold.length > maxFrames) {
          framesAboveThreshold.sort((a, b) => b.sharpness - a.sharpness);
          return framesAboveThreshold.slice(0, maxFrames).map(f => f.idx).sort((a, b) => a - b);
        }

        return framesAboveThreshold.map(f => f.idx).sort((a, b) => a - b);
      }
    }
  };

  const getSelectedFrameCount = (): number => {
    return getSelectedFrameIndices().length;
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

      // Get selected frame indices
      const selectedIndices = getSelectedFrameIndices();

      // Create a custom result with only selected frames
      const customResult = {
        ...analysisResult,
        frames: selectedIndices.map(idx => analysisResult.frames[idx])
      };

      const options: ExportOptions = {
        format: exportFormat,
        threshold: 0, // Not used when we pre-filter frames
        max_frames: undefined, // Already filtered
        min_frame_distance: 1, // Already filtered
      };

      const exportedPaths = await invoke<string[]>('export_frames', {
        videoPath,
        outputDir,
        analysisResult: customResult,
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

    const selectedIndices = getSelectedFrameIndices();
    const selectedSet = new Set(selectedIndices);

    return analysisResult.frames.map((frame, idx) => ({
      index: idx,
      frame: frame.frame_number,
      sharpness: Math.round(frame.sharpness * 100) / 100,
      timestamp: frame.timestamp.toFixed(2),
      isSelected: selectedSet.has(idx) || (selectionMode === 'manual' && manuallySelectedFrames.has(idx)),
      isManuallySelected: manuallySelectedFrames.has(idx),
    }));
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

  const renderSelectionModeUI = () => {
    return (
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold">Frame Selection</h3>

        {/* Selection Mode Tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { mode: 'threshold' as SelectionMode, label: 'Threshold' },
            { mode: 'batch' as SelectionMode, label: 'Batch Selection' },
            { mode: 'bestN' as SelectionMode, label: 'Best N' },
            { mode: 'topPercentage' as SelectionMode, label: 'Top Percentage' },
            { mode: 'manual' as SelectionMode, label: 'Manual Selection' },
          ].map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => setSelectionMode(mode)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectionMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Mode-specific settings */}
        {selectionMode === 'threshold' && (
          <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div>
              <label className="block text-sm font-medium mb-2">
                Sharpness Threshold: {threshold.toFixed(2)}
              </label>
              <input
                type="range"
                min={0}
                max={analysisResult ? Math.max(...analysisResult.frames.map((f) => f.sharpness)) : 100}
                step={0.1}
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Frames above this threshold will be selected
              </p>
            </div>

            {showSettings && (
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
                  Minimum frames between selected frames
                </p>
              </div>
            )}
          </div>
        )}

        {selectionMode === 'batch' && (
          <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Select the sharpest frame from each batch of frames
            </p>
            <div>
              <label className="block text-sm font-medium mb-2">
                Batch Size: {selectionSettings.batchSize}
              </label>
              <input
                type="range"
                min={2}
                max={20}
                value={selectionSettings.batchSize}
                onChange={(e) =>
                  setSelectionSettings({ ...selectionSettings, batchSize: parseInt(e.target.value) })
                }
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Number of frames to consider in each batch
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Batch Buffer: {selectionSettings.batchBuffer}
              </label>
              <input
                type="range"
                min={0}
                max={10}
                value={selectionSettings.batchBuffer}
                onChange={(e) =>
                  setSelectionSettings({ ...selectionSettings, batchBuffer: parseInt(e.target.value) })
                }
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Number of frames to skip between batches
              </p>
            </div>
          </div>
        )}

        {selectionMode === 'bestN' && (
          <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Select the N sharpest frames from the entire video
            </p>
            <div>
              <label className="block text-sm font-medium mb-2">
                Number of Frames: {selectionSettings.bestN}
              </label>
              <input
                type="number"
                min={1}
                max={analysisResult?.frames.length || 100}
                value={selectionSettings.bestN}
                onChange={(e) =>
                  setSelectionSettings({ ...selectionSettings, bestN: parseInt(e.target.value) || 1 })
                }
                className="input-field w-full"
              />
            </div>
          </div>
        )}

        {selectionMode === 'topPercentage' && (
          <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Select the top X% sharpest frames
            </p>
            <div>
              <label className="block text-sm font-medium mb-2">
                Percentage: {selectionSettings.topPercentage}%
              </label>
              <input
                type="range"
                min={1}
                max={100}
                value={selectionSettings.topPercentage}
                onChange={(e) =>
                  setSelectionSettings({ ...selectionSettings, topPercentage: parseInt(e.target.value) })
                }
                className="w-full"
              />
            </div>
          </div>
        )}

        {selectionMode === 'manual' && (
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Click on frames in the chart below to manually select them. {manuallySelectedFrames.size} frames selected.
            </p>
            {manuallySelectedFrames.size > 0 && (
              <button
                onClick={() => setManuallySelectedFrames(new Set())}
                className="mt-2 text-sm text-red-600 hover:text-red-700"
              >
                Clear all selections
              </button>
            )}
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
          <p className="text-sm">
            <strong>{getSelectedFrameCount()}</strong> frames will be exported with current settings
          </p>
        </div>
      </div>
    );
  };

  const renderFramePreviewModal = () => {
    if (previewFrame === null || !analysisResult) return null;

    const frame = analysisResult.frames[previewFrame];

    return (
      <div
        className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
        onClick={() => setPreviewFrame(null)}
      >
        <div
          className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
            <h3 className="text-lg font-semibold">
              Frame {frame.frame_number} Preview
            </h3>
            <button
              onClick={() => setPreviewFrame(null)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <X size={20} />
            </button>
          </div>

          {/* Image */}
          <div className="p-4">
            {loadingPreview ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : previewImageUrl ? (
              <img
                src={previewImageUrl}
                alt={`Frame ${frame.frame_number}`}
                className="w-full rounded-lg"
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                Failed to load image
              </div>
            )}
          </div>

          {/* Frame Info */}
          <div className="p-4 border-t dark:border-gray-700 space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Frame Number:</span> {frame.frame_number}
              </div>
              <div>
                <span className="font-medium">Timestamp:</span> {frame.timestamp.toFixed(2)}s
              </div>
              <div>
                <span className="font-medium">Sharpness:</span> {frame.sharpness.toFixed(2)}
              </div>
              <div>
                <span className="font-medium">Frame Name:</span> frame_{String(frame.frame_number).padStart(6, '0')}
              </div>
            </div>

            {/* Manual Selection Toggle */}
            {selectionMode === 'manual' && (
              <div className="pt-4 border-t dark:border-gray-700">
                <button
                  onClick={() => toggleManualSelection(previewFrame)}
                  className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${
                    manuallySelectedFrames.has(previewFrame)
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {manuallySelectedFrames.has(previewFrame) ? (
                    <>
                      <Check size={20} />
                      Selected for Export
                    </>
                  ) : (
                    <>Add to Export</>
                  )}
                </button>
              </div>
            )}
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
          <div className="flex items-center justify-center gap-4">
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <FileVideo size={40} />
              Sharp Frame Extractor
            </h1>
            {(videoPath || analysisResult) && (
              <button
                onClick={handleReset}
                className="btn-secondary flex items-center gap-2"
                title="Reset everything"
              >
                <RotateCcw size={20} />
                Reset
              </button>
            )}
          </div>
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
                  setManuallySelectedFrames(new Set());
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

                  {/* Time Range Selector */}
                  <div className="border-t border-blue-200 dark:border-blue-800 pt-3">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Clock size={16} />
                        Time Range
                      </label>
                      {videoDuration > 0 && (
                        <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                          Selected: {(endTime - startTime).toFixed(2)}s of {videoDuration.toFixed(2)}s
                        </span>
                      )}
                    </div>
                    {videoDuration > 0 ? (
                      <div className="space-y-3">
                        {/* Dual Range Slider with visual track */}
                        <div className="relative h-8 mb-4">
                          {/* Background track */}
                          <div className="absolute top-3 left-0 right-0 h-2 bg-gray-300 dark:bg-gray-600 rounded"></div>
                          {/* Active range highlight */}
                          <div
                            className="absolute top-3 h-2 bg-blue-500 rounded pointer-events-none"
                            style={{
                              left: `${(startTime / videoDuration) * 100}%`,
                              width: `${((endTime - startTime) / videoDuration) * 100}%`
                            }}
                          ></div>
                          {/* Start time slider */}
                          <input
                            type="range"
                            min={0}
                            max={videoDuration}
                            step={0.1}
                            value={startTime}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (val < endTime) setStartTime(val);
                            }}
                            onMouseDown={() => setDraggingSlider('start')}
                            onMouseUp={() => setDraggingSlider(null)}
                            onTouchStart={() => setDraggingSlider('start')}
                            onTouchEnd={() => setDraggingSlider(null)}
                            className="absolute top-0 left-0 w-full h-8 appearance-none bg-transparent cursor-pointer"
                            style={{
                              zIndex: draggingSlider === 'start' ? 6 : 4
                            }}
                          />
                          {/* End time slider */}
                          <input
                            type="range"
                            min={0}
                            max={videoDuration}
                            step={0.1}
                            value={endTime}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (val > startTime) setEndTime(val);
                            }}
                            onMouseDown={() => setDraggingSlider('end')}
                            onMouseUp={() => setDraggingSlider(null)}
                            onTouchStart={() => setDraggingSlider('end')}
                            onTouchEnd={() => setDraggingSlider(null)}
                            className="absolute top-0 left-0 w-full h-8 appearance-none bg-transparent cursor-pointer"
                            style={{
                              zIndex: draggingSlider === 'end' ? 6 : 5
                            }}
                          />
                        </div>

                        {/* Manual input boxes */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-400">
                              Start Time (seconds)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={videoDuration}
                              step={0.1}
                              value={startTime}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val)) {
                                  setStartTime(val);
                                }
                              }}
                              onBlur={(e) => {
                                // Ensure valid value on blur
                                const val = parseFloat(e.target.value);
                                if (isNaN(val) || val < 0) {
                                  setStartTime(0);
                                } else if (val >= endTime) {
                                  setStartTime(Math.max(0, endTime - 0.1));
                                } else if (val > videoDuration) {
                                  setStartTime(Math.max(0, videoDuration - 0.1));
                                }
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-400">
                              End Time (seconds)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={videoDuration}
                              step={0.1}
                              value={endTime}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val)) {
                                  setEndTime(val);
                                }
                              }}
                              onBlur={(e) => {
                                // Ensure valid value on blur
                                const val = parseFloat(e.target.value);
                                if (isNaN(val) || val > videoDuration) {
                                  setEndTime(videoDuration);
                                } else if (val <= startTime) {
                                  setEndTime(Math.min(videoDuration, startTime + 0.1));
                                } else if (val < 0) {
                                  setEndTime(videoDuration);
                                }
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>

                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Analyze frames from {startTime.toFixed(2)}s to {endTime.toFixed(2)}s
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                        Time range will be available after video metadata is loaded
                      </p>
                    )}
                  </div>

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
                      GPU Acceleration (experimental)
                    </label>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {useGpu ? 'Currently uses multi-core CPU processing for optimal speed. GPU support is experimental and may not improve performance.' : 'Multi-core CPU processing - optimized for maximum throughput'}
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
                    <strong>Note:</strong> Processing frames in batches with GPU acceleration for maximum performance
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
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Click on any bar to preview the frame
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="index"
                      label={{ value: 'Frame Index', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis
                      label={{ value: 'Sharpness', angle: -90, position: 'insideLeft' }}
                      domain={[0, 'auto']}
                    />
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
                              {data.isSelected && (
                                <p className="text-sm text-amber-600 font-medium">
                                  ✓ Selected for export
                                </p>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                Click to preview
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {selectionMode === 'threshold' && (
                      <ReferenceLine
                        y={threshold}
                        stroke="red"
                        strokeDasharray="3 3"
                        label={{ value: 'Threshold', position: 'right' }}
                      />
                    )}
                    <Bar
                      dataKey="sharpness"
                      minPointSize={2}
                      onClick={(data: any) => {
                        if (data && data.index !== undefined) {
                          handleFrameClick(data.index);
                        }
                      }}
                    >
                      {getChartData().map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.isSelected ? '#f59e0b' : '#3b82f6'}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Frame Selection UI */}
            {renderSelectionModeUI()}

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

              <button
                onClick={exportFrames}
                disabled={exporting || getSelectedFrameCount() === 0}
                className="btn-primary w-full"
              >
                <Download size={20} className="inline mr-2" />
                {exporting ? 'Exporting...' : `Export ${getSelectedFrameCount()} Selected Frames`}
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

      {/* Frame Preview Modal */}
      {renderFramePreviewModal()}
    </div>
  );
}

export default App;
