import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileText,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { VaultFile } from '../../types/vault';
import { formatBytes, getFileRawUrl } from '../../lib/api';

interface PDFViewerModalProps {
  file: VaultFile;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
}

export const PDFViewerModal: React.FC<PDFViewerModalProps> = ({
  file,
  isOpen,
  onClose,
  onDownload,
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const rawUrl = getFileRawUrl(file.id);

  // Keyboard navigation
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
        setZoom((z) => Math.min(250, z + 15));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => Math.max(50, z - 15));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(100);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setCurrentPage((p) => p + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setCurrentPage((p) => Math.max(1, p - 1));
      } else if (e.key === 'Home') {
        setCurrentPage(1);
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

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-zinc-950 flex flex-col overflow-hidden select-none animate-in fade-in duration-200"
    >
      {/* Top Bar */}
      <header className="h-14 bg-zinc-900 border-b border-zinc-800 px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-red-950/60 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate font-sans">
              {file.originalName}
            </h3>
            <div className="text-[11px] text-zinc-500 font-mono">
              <span>{formatBytes(file.sizeBytes)}</span>
              <span className="mx-1.5">·</span>
              <span>Encrypted Stream</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center gap-1 bg-zinc-950/60 border border-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setZoom((z) => Math.max(50, z - 15))}
              className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              title="Zoom out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono text-zinc-300 w-12 text-center tabular-nums">
              {zoom}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(250, z + 15))}
              className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              title="Zoom in (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(100)}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              title="Reset Zoom (0)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            title="Toggle fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Download */}
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer"
            title="Download PDF"
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

      {/* Main PDF View Area */}
      <div className="flex-1 bg-zinc-950 relative overflow-hidden flex items-center justify-center p-2 sm:p-4">
        <div
          className="w-full h-full max-w-5xl rounded-xl overflow-hidden shadow-2xl bg-zinc-900 border border-zinc-800 flex flex-col transition-all duration-150"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'center center',
          }}
        >
          <iframe
            src={`${rawUrl}#toolbar=0&navpanes=0`}
            title={file.originalName}
            className="w-full h-full border-0 bg-white"
          />
        </div>
      </div>

      {/* Bottom Bar: Navigation / Short-cuts hint */}
      <footer className="h-10 bg-zinc-900/90 border-t border-zinc-800 px-4 flex items-center justify-between text-[11px] text-zinc-500 font-mono shrink-0">
        <div className="flex items-center gap-3">
          <span>Shortcuts: PageUp/Down · Zoom: +/- · Esc: Close</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={rawUrl}
            target="_blank"
            rel="noreferrer"
            className="text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-colors"
          >
            <span>Open in Tab</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </footer>
    </div>
  );
};
