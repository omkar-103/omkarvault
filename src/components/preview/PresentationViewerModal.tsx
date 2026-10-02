import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Download,
  MousePointer,
  PenTool,
  Highlighter,
  Eraser,
  RotateCcw,
  Trash2,
  Layers,
  HelpCircle,
  Play,
  Pause,
  Undo2,
  Tv,
} from 'lucide-react';
import { VaultFile, PresentationMeta, SlideData, AnnotationStroke } from '../../types/vault';
import { fetchPresentation } from '../../lib/api';

interface PresentationViewerModalProps {
  file: VaultFile;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
}

type ActiveTool = 'none' | 'laser' | 'pen' | 'highlighter' | 'eraser';

export const PresentationViewerModal: React.FC<PresentationViewerModalProps> = ({
  file,
  isOpen,
  onClose,
  onDownload,
}) => {
  const [presentation, setPresentation] = useState<PresentationMeta | null>(file.presentationMeta || null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(!file.presentationMeta || file.presentationMeta.status === 'processing');
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [penColor, setPenColor] = useState<string>('#ef4444');
  const [penWidth, setPenWidth] = useState<number>(4);
  const [highlighterColor, setHighlighterColor] = useState<string>('#f59e0b');
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showThumbnails, setShowThumbnails] = useState<boolean>(false);
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);

  // Annotations stored per slide: slideIndex -> AnnotationStroke[]
  const [annotations, setAnnotations] = useState<Record<number, AnnotationStroke[]>>({});

  // Laser Pointer State
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);

  // Drawing Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef<boolean>(false);
  const currentStrokeRef = useRef<AnnotationStroke | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const slideAreaRef = useRef<HTMLDivElement>(null);

  // Touch Swipe coordinates
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Load Presentation data if needed
  useEffect(() => {
    if (!isOpen) return;
    if (!presentation || presentation.status === 'processing') {
      setIsLoading(true);
      fetchPresentation(file.id)
        .then((data) => {
          setPresentation(data);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setIsLoading(false);
        });
    }
  }, [isOpen, file.id, presentation]);

  const totalSlides = presentation?.slideCount || 1;
  const currentSlide: SlideData | undefined = presentation?.slides?.find((s) => s.index === currentSlideIndex) || presentation?.slides?.[0];

  // Auto-play slideshow timer
  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev < totalSlides ? prev + 1 : 1));
    }, 4000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, totalSlides]);

  // Fullscreen listeners
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        setCurrentSlideIndex((prev) => Math.min(totalSlides, prev + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentSlideIndex((prev) => Math.max(1, prev - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentSlideIndex(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCurrentSlideIndex(totalSlides);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setActiveTool((t) => (t === 'laser' ? 'none' : 'laser'));
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setActiveTool((t) => (t === 'pen' ? 'none' : 'pen'));
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setActiveTool((t) => (t === 'eraser' ? 'none' : 'eraser'));
      } else if (e.key === '?' || e.key === '/') {
        e.preventDefault();
        setShowShortcuts((s) => !s);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(200, z + 10));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => Math.max(60, z - 10));
      } else if (e.key === 'Escape') {
        if (showShortcuts) {
          setShowShortcuts(false);
        } else if (showThumbnails) {
          setShowThumbnails(false);
        } else if (isFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, totalSlides, isFullscreen, showShortcuts, showThumbnails, onClose]);

  // Redraw Canvas Annotations when slide changes or strokes change
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const slideStrokes = annotations[currentSlideIndex] || [];
    for (const stroke of slideStrokes) {
      if (stroke.points.length < 2) continue;

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }

      if (stroke.type === 'highlighter') {
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = stroke.width * 3.5;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
      } else {
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }

      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }, [annotations, currentSlideIndex]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Resize canvas overlay to match slide area
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      const slideEl = slideAreaRef.current;
      if (!canvas || !slideEl) return;
      canvas.width = slideEl.clientWidth;
      canvas.height = slideEl.clientHeight;
      redrawCanvas();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [redrawCanvas, currentSlideIndex, zoom]);

  // Pointer & Laser Coordinates
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'laser') {
      const rect = slideAreaRef.current?.getBoundingClientRect();
      if (rect) {
        setLaserPos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
    }
  };

  const handleMouseLeave = () => {
    if (activeTool === 'laser') {
      setLaserPos(null);
    }
  };

  // Drawing Handlers
  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'pen' && activeTool !== 'highlighter' && activeTool !== 'eraser') return;
    const coords = getCanvasCoords(e.clientX, e.clientY);

    if (activeTool === 'eraser') {
      // Find and remove strokes within radius
      const currentList = annotations[currentSlideIndex] || [];
      const updated = currentList.filter((stroke) => {
        return !stroke.points.some(
          (p) => Math.hypot(p.x - coords.x, p.y - coords.y) < 20
        );
      });
      setAnnotations((prev) => ({ ...prev, [currentSlideIndex]: updated }));
      return;
    }

    isDrawingRef.current = true;
    const newStroke: AnnotationStroke = {
      id: Math.random().toString(36).substring(2),
      type: activeTool === 'highlighter' ? 'highlighter' : 'pen',
      color: activeTool === 'highlighter' ? highlighterColor : penColor,
      width: activeTool === 'highlighter' ? penWidth * 2 : penWidth,
      points: [coords],
    };
    currentStrokeRef.current = newStroke;

    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool === 'eraser' && e.buttons === 1) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      const currentList = annotations[currentSlideIndex] || [];
      const updated = currentList.filter((stroke) => {
        return !stroke.points.some(
          (p) => Math.hypot(p.x - coords.x, p.y - coords.y) < 20
        );
      });
      setAnnotations((prev) => ({ ...prev, [currentSlideIndex]: updated }));
      return;
    }

    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    const coords = getCanvasCoords(e.clientX, e.clientY);
    currentStrokeRef.current.points.push(coords);

    const ctx = canvasRef.current?.getContext('2d');
    const stroke = currentStrokeRef.current;
    if (ctx && stroke) {
      ctx.lineTo(coords.x, coords.y);
      if (stroke.type === 'highlighter') {
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = stroke.width * 3.5;
        ctx.lineCap = 'square';
      } else {
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = 'round';
      }
      ctx.stroke();
    }
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current || !currentStrokeRef.current) {
      isDrawingRef.current = false;
      return;
    }
    isDrawingRef.current = false;
    const finishedStroke = currentStrokeRef.current;
    currentStrokeRef.current = null;

    setAnnotations((prev) => {
      const existing = prev[currentSlideIndex] || [];
      return {
        ...prev,
        [currentSlideIndex]: [...existing, finishedStroke],
      };
    });
  };

  // Undo stroke on current slide
  const handleUndo = () => {
    setAnnotations((prev) => {
      const existing = prev[currentSlideIndex] || [];
      if (existing.length === 0) return prev;
      return {
        ...prev,
        [currentSlideIndex]: existing.slice(0, -1),
      };
    });
  };

  // Clear current slide annotations
  const handleClearSlideAnnotations = () => {
    setAnnotations((prev) => ({
      ...prev,
      [currentSlideIndex]: [],
    }));
    setShowClearConfirm(false);
  };

  // Touch Swipe Handlers for mobile presentation
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || activeTool === 'pen' || activeTool === 'highlighter') return;
    const touchEnd = e.changedTouches[0];
    const diffX = touchEnd.clientX - touchStartRef.current.x;
    const diffY = touchEnd.clientY - touchStartRef.current.y;

    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        // Swipe left -> Next slide
        setCurrentSlideIndex((prev) => Math.min(totalSlides, prev + 1));
      } else {
        // Swipe right -> Prev slide
        setCurrentSlideIndex((prev) => Math.max(1, prev - 1));
      }
    }
    touchStartRef.current = null;
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-zinc-950 flex flex-col overflow-hidden select-none animate-in fade-in duration-200"
    >
      {/* Top Header: Filename, Slide Status, Actions */}
      <header className="h-14 bg-zinc-900 border-b border-zinc-800 px-4 sm:px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
            <Tv className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate font-sans">
              {file.originalName}
            </h3>
            <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-1.5">
              <span>{totalSlides} {totalSlides === 1 ? 'Slide' : 'Slides'}</span>
              <span>·</span>
              <span>Slide {currentSlideIndex} of {totalSlides}</span>
            </div>
          </div>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center gap-2">
          {/* Thumbnails Drawer Toggle */}
          <button
            onClick={() => setShowThumbnails(!showThumbnails)}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              showThumbnails
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            }`}
            title="Toggle Slide Thumbnails"
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* Keyboard Shortcuts Help */}
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            title="Keyboard Shortcuts (?)"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            title="Toggle Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Download Original */}
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer"
            title="Download original PPTX"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download Original</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            title="Close presentation (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Presentation Stage & Optional Slide Thumbnails Drawer */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Thumbnails Sidebar */}
        {showThumbnails && (
          <aside className="w-64 bg-zinc-900/95 border-r border-zinc-800 flex flex-col shrink-0 z-30 animate-in slide-in-from-left duration-200">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-400">
              <span>SLIDES ({totalSlides})</span>
              <button
                onClick={() => setShowThumbnails(false)}
                className="text-zinc-500 hover:text-zinc-300 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {presentation?.slides.map((s) => (
                <div
                  key={s.index}
                  onClick={() => {
                    setCurrentSlideIndex(s.index);
                  }}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all duration-150 ${
                    currentSlideIndex === s.index
                      ? 'border-amber-500 bg-amber-500/10 shadow-sm'
                      : 'border-zinc-800/80 bg-zinc-950/40 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 mb-1">
                    <span>Slide {s.index}</span>
                    {annotations[s.index]?.length ? (
                      <span className="text-amber-400 font-bold">●</span>
                    ) : null}
                  </div>
                  {s.backgroundImageUrl && (
                    <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-zinc-700/50 mb-1.5 bg-zinc-900">
                      <img
                        src={s.backgroundImageUrl}
                        alt={`Slide ${s.index}`}
                        className="w-full h-full object-cover select-none pointer-events-none"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <p className="text-xs font-semibold text-zinc-200 line-clamp-1">
                    {s.title || `Slide ${s.index}`}
                  </p>
                  <p className="text-[10px] text-zinc-500 line-clamp-1 mt-0.5">
                    {s.bulletPoints[0] || s.paragraphs[0] || 'Slide content'}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Presentation Viewport */}
        <main
          className="flex-1 bg-zinc-950 flex flex-col items-center justify-center p-3 sm:p-6 lg:p-8 relative overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {isLoading ? (
            <div className="text-center space-y-3">
              <span className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin inline-block" />
              <p className="text-xs font-mono text-zinc-400">Processing presentation slides...</p>
            </div>
          ) : (
            <div
              ref={slideAreaRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className="relative w-full max-w-5xl aspect-video rounded-2xl shadow-2xl overflow-hidden border border-zinc-800 transition-transform duration-150 flex flex-col select-none"
              style={{
                backgroundColor: currentSlide?.backgroundColor || (currentSlide?.backgroundImageUrl ? '#ffffff' : '#0f172a'),
                aspectRatio: currentSlide?.aspectRatio ? `${currentSlide.aspectRatio}` : '16/9',
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'center center',
                containerType: 'inline-size',
              }}
            >
              {/* Subtle ambient lighting for dark non-image slides */}
              {!currentSlide?.backgroundImageUrl && (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-transparent pointer-events-none" />
              )}

              {/* Render High-Fidelity Visual Slide if background or placed elements exist */}
              {currentSlide?.backgroundImageUrl || (currentSlide?.placedTexts && currentSlide.placedTexts.length > 0) || (currentSlide?.placedImages && currentSlide.placedImages.length > 0) ? (
                <>
                  {/* Full-Bleed Slide Graphic / Background */}
                  {currentSlide.backgroundImageUrl && (
                    <img
                      src={currentSlide.backgroundImageUrl}
                      alt={`Slide ${currentSlideIndex}`}
                      className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none z-0"
                      loading="eager"
                    />
                  )}

                  {/* Placed Media (Badges, Overlays, Product Shots) */}
                  {currentSlide.placedImages?.map((img, idx) => (
                    <div
                      key={`pimg-${idx}`}
                      className="absolute pointer-events-none select-none z-10 flex items-center justify-center overflow-hidden"
                      style={{
                        left: `${Math.max(0, img.left)}%`,
                        top: `${Math.max(0, img.top)}%`,
                        width: `${img.width}%`,
                        height: `${img.height}%`,
                      }}
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ))}

                  {/* Placed Text Elements (Aligned, Styled, Proportional) */}
                  {currentSlide.placedTexts?.map((txt, idx) => (
                    <div
                      key={`ptxt-${idx}`}
                      className="absolute z-20 flex flex-col justify-start select-text overflow-hidden"
                      style={{
                        left: `${Math.max(0, txt.left)}%`,
                        top: `${Math.max(0, txt.top)}%`,
                        width: `${Math.min(100 - Math.max(0, txt.left), txt.width)}%`,
                        minHeight: `${txt.height}%`,
                      }}
                    >
                      {txt.paragraphs.map((p, pIdx) => (
                        <div
                          key={`p-${pIdx}`}
                          style={{
                            textAlign: p.align,
                            lineHeight: 1.25,
                          }}
                          className="mb-1 last:mb-0"
                        >
                          {p.runs.map((r, rIdx) => {
                            const fontScale = r.fontSize ? `${(r.fontSize * 0.07).toFixed(2)}cqi` : undefined;
                            return (
                              <span
                                key={`r-${rIdx}`}
                                style={{
                                  fontSize: fontScale || 'clamp(11px, 1.2cqi, 20px)',
                                  fontWeight: r.bold ? 700 : 400,
                                  fontStyle: r.italic ? 'italic' : 'normal',
                                  color: r.color || (currentSlide.backgroundImageUrl ? '#1e293b' : '#f8fafc'),
                                  fontFamily: r.fontFamily ? `"${r.fontFamily}", sans-serif` : 'inherit',
                                }}
                              >
                                {r.text}
                              </span>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              ) : (
                /* Fallback for Plain / Raw Presentations */
                <div className="relative z-10 w-full h-full p-8 sm:p-12 lg:p-14 flex flex-col justify-between select-text text-zinc-100">
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-widest text-amber-400/90 mb-2">
                      SLIDE {currentSlideIndex}
                    </div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white font-sans max-w-3xl">
                      {currentSlide?.title || `Slide ${currentSlideIndex}`}
                    </h2>
                  </div>

                  <div className="my-auto py-4 space-y-4">
                    {currentSlide?.bulletPoints && currentSlide.bulletPoints.length > 0 ? (
                      <ul className="space-y-3 max-w-3xl">
                        {currentSlide.bulletPoints.map((bullet, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm sm:text-base lg:text-lg text-zinc-200">
                            <span className="text-amber-400 mt-1 shrink-0 font-bold">▪</span>
                            <span className="leading-relaxed">{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    ) : currentSlide?.paragraphs && currentSlide.paragraphs.length > 0 ? (
                      <div className="space-y-3 max-w-3xl">
                        {currentSlide.paragraphs.map((p, idx) => (
                          <p key={idx} className="text-sm sm:text-base lg:text-lg text-zinc-300 leading-relaxed">
                            {p}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-zinc-500 font-mono text-sm italic">
                        [ Empty Slide ]
                      </p>
                    )}

                    {currentSlide?.images && currentSlide.images.length > 0 && (
                      <div className="flex flex-wrap gap-4 pt-3">
                        {currentSlide.images.map((img, idx) => (
                          <img
                            key={idx}
                            src={img.url}
                            alt={img.name}
                            className="max-h-40 rounded-xl border border-white/10 shadow-lg object-contain bg-zinc-900/50"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-4 border-t border-white/10">
                    <span className="truncate max-w-[250px]">{file.originalName}</span>
                    <span>{currentSlideIndex} / {totalSlides}</span>
                  </div>
                </div>
              )}

              {/* Annotation Canvas Overlay */}
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className={`absolute inset-0 z-30 touch-none ${
                  activeTool === 'pen'
                    ? 'cursor-crosshair'
                    : activeTool === 'highlighter'
                    ? 'cursor-text'
                    : activeTool === 'eraser'
                    ? 'cursor-cell'
                    : activeTool === 'laser'
                    ? 'cursor-none'
                    : 'pointer-events-none'
                }`}
              />

              {/* Laser Pointer Glowing Dot */}
              {activeTool === 'laser' && laserPos && (
                <div
                  className="laser-dot"
                  style={{
                    left: `${laserPos.x}px`,
                    top: `${laserPos.y}px`,
                  }}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Floating Bottom Presentation Toolbar */}
      <footer className="h-16 bg-zinc-900/95 border-t border-zinc-800/80 px-4 sm:px-6 flex items-center justify-between shrink-0 z-20">
        {/* Left: Navigation (Prev / Next / Counter) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentSlideIndex((p) => Math.max(1, p - 1))}
            disabled={currentSlideIndex <= 1}
            className="p-2 rounded-lg text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 transition-colors cursor-pointer"
            title="Previous Slide (Left Arrow)"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span className="text-xs font-mono text-zinc-300 tabular-nums px-2 py-1 bg-zinc-950/60 border border-zinc-800 rounded-lg">
            <strong>{currentSlideIndex}</strong> / {totalSlides}
          </span>

          <button
            onClick={() => setCurrentSlideIndex((p) => Math.min(totalSlides, p + 1))}
            disabled={currentSlideIndex >= totalSlides}
            className="p-2 rounded-lg text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 transition-colors cursor-pointer"
            title="Next Slide (Right Arrow / Space)"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <button
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isAutoPlaying ? 'bg-amber-500/20 text-amber-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
            title={isAutoPlaying ? 'Pause Slideshow' : 'Auto Play Slideshow'}
          >
            {isAutoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>

        {/* Center: Presentation Annotation & Laser Tools */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-950/80 border border-zinc-800 rounded-xl">
          {/* Laser Pointer */}
          <button
            onClick={() => setActiveTool((t) => (t === 'laser' ? 'none' : 'laser'))}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              activeTool === 'laser'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
            title="Laser Pointer (P)"
          >
            <MousePointer className="w-4 h-4" />
          </button>

          {/* Pen Tool */}
          <button
            onClick={() => setActiveTool((t) => (t === 'pen' ? 'none' : 'pen'))}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              activeTool === 'pen'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
            title="Pen (D)"
          >
            <PenTool className="w-4 h-4" />
          </button>

          {/* Highlighter Tool */}
          <button
            onClick={() => setActiveTool((t) => (t === 'highlighter' ? 'none' : 'highlighter'))}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              activeTool === 'highlighter'
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
            title="Highlighter"
          >
            <Highlighter className="w-4 h-4" />
          </button>

          {/* Eraser Tool */}
          <button
            onClick={() => setActiveTool((t) => (t === 'eraser' ? 'none' : 'eraser'))}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              activeTool === 'eraser'
                ? 'bg-zinc-700 text-zinc-100 border border-zinc-600 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
            title="Eraser (E)"
          >
            <Eraser className="w-4 h-4" />
          </button>

          {/* Undo annotation */}
          {(annotations[currentSlideIndex]?.length ?? 0) > 0 && (
            <button
              onClick={handleUndo}
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Undo last stroke"
            >
              <Undo2 className="w-4 h-4" />
            </button>
          )}

          {/* Clear annotations */}
          {(annotations[currentSlideIndex]?.length ?? 0) > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Clear all annotations on this slide"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Right: Zoom Controls */}
        <div className="flex items-center gap-1 bg-zinc-950/60 border border-zinc-800 rounded-lg p-1">
          <button
            onClick={() => setZoom((z) => Math.max(60, z - 10))}
            className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono text-zinc-400 w-12 text-center tabular-nums">
            {zoom}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(200, z + 10))}
            className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(100)}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            title="Reset Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </footer>

      {/* Clear Annotations Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <h4 className="text-sm font-semibold text-zinc-100">Clear Slide Annotations?</h4>
            <p className="text-xs text-zinc-400">
              This will remove all drawing marks and highlighter strokes on Slide {currentSlideIndex}.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleClearSlideAnnotations}
                className="px-3.5 py-1.5 text-xs font-mono font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Dialog */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h4 className="text-sm font-semibold text-zinc-100 font-sans">
                Presentation Keyboard Shortcuts
              </h4>
              <button
                onClick={() => setShowShortcuts(false)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 bg-zinc-950/50 rounded-lg flex justify-between">
                <span className="text-zinc-400">Next Slide</span>
                <span className="text-amber-400 font-bold">→ / Space</span>
              </div>
              <div className="p-2 bg-zinc-950/50 rounded-lg flex justify-between">
                <span className="text-zinc-400">Prev Slide</span>
                <span className="text-amber-400 font-bold">←</span>
              </div>
              <div className="p-2 bg-zinc-950/50 rounded-lg flex justify-between">
                <span className="text-zinc-400">First / Last</span>
                <span className="text-amber-400 font-bold">Home / End</span>
              </div>
              <div className="p-2 bg-zinc-950/50 rounded-lg flex justify-between">
                <span className="text-zinc-400">Fullscreen</span>
                <span className="text-amber-400 font-bold">F</span>
              </div>
              <div className="p-2 bg-zinc-950/50 rounded-lg flex justify-between">
                <span className="text-zinc-400">Laser Pointer</span>
                <span className="text-amber-400 font-bold">P</span>
              </div>
              <div className="p-2 bg-zinc-950/50 rounded-lg flex justify-between">
                <span className="text-zinc-400">Pen Draw</span>
                <span className="text-amber-400 font-bold">D</span>
              </div>
              <div className="p-2 bg-zinc-950/50 rounded-lg flex justify-between">
                <span className="text-zinc-400">Eraser</span>
                <span className="text-amber-400 font-bold">E</span>
              </div>
              <div className="p-2 bg-zinc-950/50 rounded-lg flex justify-between">
                <span className="text-zinc-400">Zoom In/Out</span>
                <span className="text-amber-400 font-bold">+ / -</span>
              </div>
            </div>

            <div className="text-[11px] text-zinc-500 font-mono text-center pt-2">
              Mobile touch: Swipe left/right to navigate slides.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
