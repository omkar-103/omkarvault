import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Image as ImageIcon,
} from 'lucide-react';
import { VaultFile } from '../../types/vault';
import { formatBytes, getFileRawUrl } from '../../lib/api';

interface ImageViewerModalProps {
  file: VaultFile;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  file,
  isOpen,
  onClose,
  onDownload,
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const rawUrl = getFileRawUrl(file.id);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(400, z + 20));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => Math.max(30, z - 20));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(100);
        setPan({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, onClose]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 100) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-zinc-950 flex flex-col overflow-hidden select-none animate-in fade-in duration-200"
    >
      {/* Top Header */}
      <header className="h-14 bg-zinc-900 border-b border-zinc-800 px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate font-sans">
              {file.originalName}
            </h3>
            <div className="text-[11px] text-zinc-500 font-mono">
              <span>{formatBytes(file.sizeBytes)}</span>
              <span className="mx-1.5">·</span>
              <span className="uppercase">{file.extension}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-zinc-950/60 border border-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setZoom((z) => Math.max(30, z - 20))}
              className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              title="Zoom out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono text-zinc-300 w-12 text-center tabular-nums">
              {zoom}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(400, z + 20))}
              className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              title="Zoom in (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setZoom(100);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            title="Toggle fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Download */}
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer"
            title="Download image"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            title="Close viewer (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Image Stage */}
      <div
        className="flex-1 bg-zinc-950 flex items-center justify-center p-4 overflow-hidden relative cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={rawUrl}
          alt={file.originalName}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-transform duration-75 select-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
            pointerEvents: zoom > 100 ? 'none' : 'auto',
          }}
          draggable={false}
        />
      </div>

      {/* Bottom Hint */}
      <footer className="h-9 bg-zinc-900/90 border-t border-zinc-800 px-4 flex items-center justify-between text-[11px] text-zinc-500 font-mono shrink-0">
        <span>Click and drag to pan when zoomed in · Shortcuts: +/-/0 · Esc: Close</span>
        <span className="tabular-nums">Zoom: {zoom}%</span>
      </footer>
    </div>
  );
};
