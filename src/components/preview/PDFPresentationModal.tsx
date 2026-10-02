import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import * as pdfjs from 'pdfjs-dist';
import {
  X,
  Download,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Pencil,
  Highlighter,
  Eraser,
  Trash2,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
  MousePointer2,
} from 'lucide-react';
import { VaultFile } from '../../types/vault';
import { getFileRawUrl } from '../../lib/api';

// Point pdfjs worker at the bundled file
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PDFPresentationModalProps {
  file: VaultFile;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
}

type Tool = 'pointer' | 'pen' | 'highlighter' | 'eraser' | 'none';

interface AnnotationPoint {
  x: number;
  y: number;
}

interface AnnotationStroke {
  id: string;
  tool: 'pen' | 'highlighter';
  color: string;
  width: number;
  alpha: number;
  points: AnnotationPoint[];
}

const PEN_COLORS = ['#E63946', '#2196F3', '#4CAF50', '#FFD93D', '#FF6B6B', '#000000'];
const HIGHLIGHT_COLORS = ['#FFD93D', '#C4B5FD', '#86efac', '#fca5a5', '#93c5fd'];

// ─────────────────────────── Tool Button ──────────────────────────────
interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  activeColor: string;
  onClick: () => void;
}

const ToolButton: React.FC<ToolButtonProps> = ({ icon, label, active, activeColor, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    className="flex items-center gap-1 px-2 py-1.5 border-4 border-black font-black text-[10px] uppercase tracking-wide transition-all active:translate-x-[2px] active:translate-y-[2px] shrink-0"
    style={{
      background: active ? activeColor : '#fff',
      boxShadow: active ? 'none' : '3px 3px 0 0 #000',
      transform: active ? 'translate(3px, 3px)' : undefined,
    }}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </button>
);

export const PDFPresentationModal: React.FC<PDFPresentationModalProps> = ({
  file,
  isOpen,
  onClose,
  onDownload,
}) => {
  // ── PDF State ──
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [pageInputValue, setPageInputValue] = useState('1');

  // ── Tool State ──
  const [activeTool, setActiveTool] = useState<Tool>('none');
  const [penColor, setPenColor] = useState('#E63946');
  const [highlightColor, setHighlightColor] = useState('#FFD93D');
  const [penSize, setPenSize] = useState(3);

  // ── Annotation State ──
  const [annotations, setAnnotations] = useState<Record<number, AnnotationStroke[]>>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<AnnotationStroke | null>(null);

  // ── Laser Pointer ──
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);

  // ── Thumbnail Canvases ──
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});

  // ── Touch / Swipe ──
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // ── Refs ──
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const currentPageRef = useRef(1);

  // Keep refs in sync
  useEffect(() => { pdfDocRef.current = pdfDoc; }, [pdfDoc]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  // ─────────────────────────── Load PDF ────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    setLoadError(null);
    setPdfDoc(null);
    setTotalPages(0);
    setCurrentPage(1);
    setPageInputValue('1');
    setAnnotations({});
    setThumbnails({});

    const rawUrl = getFileRawUrl(file.id);
    const loadingTask = pdfjs.getDocument({ url: rawUrl, withCredentials: true });

    loadingTask.promise
      .then((doc) => {
        setPdfDoc(doc);
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        setIsLoading(false);
        generateThumbnails(doc, doc.numPages);
      })
      .catch((err) => {
        console.error('PDF load error:', err);
        setLoadError('Failed to load PDF. Please try again.');
        setIsLoading(false);
      });

    return () => {
      loadingTask.destroy().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, file.id]);

  // ─────────────────────────── Thumbnail Gen ────────────────────────
  const generateThumbnails = async (doc: pdfjs.PDFDocumentProxy, numPages: number) => {
    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        setThumbnails((prev) => ({ ...prev, [i]: canvas.toDataURL('image/jpeg', 0.7) }));
      } catch {
        // skip
      }
    }
  };

  // ─────────────────────────── Render Page ──────────────────────────
  // ─────────────────────────── Annotation Draw (Normalized 0..1 coordinates) ──
  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: AnnotationStroke, width: number, height: number) => {
    if (stroke.points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = stroke.alpha;
    ctx.strokeStyle = stroke.color;
    // Scale stroke width proportionally so annotations look identical on mobile & 4K
    const scale = width / 1000;
    ctx.lineWidth = Math.max(1, stroke.width * scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x * width, stroke.points[i].y * height);
    }
    ctx.stroke();
    ctx.restore();
  };

  const redrawAnnotations = useCallback((pageNum: number, canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const strokes = annotations[pageNum] || [];
    strokes.forEach((stroke) => {
      drawStroke(ctx, stroke, canvas.width, canvas.height);
    });
  }, [annotations]);

  // ─────────────────────────── Render Page ──────────────────────────
  const renderPage = useCallback(async (pageNum: number, zoomLevel: number) => {
    const doc = pdfDocRef.current;
    if (!doc || !canvasRef.current) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
      renderTaskRef.current = null;
    }

    try {
      const page = await doc.getPage(pageNum);
      const container = canvasRef.current.parentElement?.parentElement;
      const availWidth = container ? container.clientWidth - 48 : window.innerWidth - 48;
      const availHeight = container ? container.clientHeight - 48 : window.innerHeight - 140;

      const naturalViewport = page.getViewport({ scale: 1 });
      const scaleX = availWidth / naturalViewport.width;
      const scaleY = availHeight / naturalViewport.height;
      const baseScale = Math.min(scaleX, scaleY);
      const fitScale = Math.max(0.1, baseScale * (zoomLevel / 100));

      const viewport = page.getViewport({ scale: fitScale });
      const dpr = window.devicePixelRatio || 1;

      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext('2d')!;
      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        transform: transform as unknown as number[] | undefined,
      });
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      renderTaskRef.current = null;

      if (annotationCanvasRef.current) {
        const aCanvas = annotationCanvasRef.current;
        aCanvas.width = Math.floor(viewport.width * dpr);
        aCanvas.height = Math.floor(viewport.height * dpr);
        aCanvas.style.width = `${Math.floor(viewport.width)}px`;
        aCanvas.style.height = `${Math.floor(viewport.height)}px`;
        redrawAnnotations(pageNum, aCanvas);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'RenderingCancelledException') {
        console.error('Page render error:', err);
      }
    }
  }, [redrawAnnotations]);

  useEffect(() => {
    if (!isLoading && pdfDoc) {
      renderPage(currentPage, zoom);
    }
  }, [currentPage, zoom, isLoading, pdfDoc, renderPage]);

  // Window resize handler
  useEffect(() => {
    let timeoutId: number;
    const handleResize = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        if (!isLoading && pdfDocRef.current) {
          renderPage(currentPageRef.current, zoom);
        }
      }, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, [isLoading, zoom, renderPage]);

  // Sync annotation canvas when page changes
  useEffect(() => {
    if (annotationCanvasRef.current && canvasRef.current) {
      annotationCanvasRef.current.width = canvasRef.current.width;
      annotationCanvasRef.current.height = canvasRef.current.height;
      annotationCanvasRef.current.style.width = canvasRef.current.style.width;
      annotationCanvasRef.current.style.height = canvasRef.current.style.height;
      redrawAnnotations(currentPage, annotationCanvasRef.current);
    }
  }, [currentPage, annotations, redrawAnnotations]);

  const getCanvasPoint = (e: React.PointerEvent): AnnotationPoint | null => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const eraseAt = useCallback((pt: AnnotationPoint) => {
    const eraserRadiusNorm = 0.035; // ~3.5% of page dimension
    setAnnotations((prev) => {
      const strokes = prev[currentPage] || [];
      const filtered = strokes.filter((stroke) =>
        !stroke.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < eraserRadiusNorm)
      );
      return { ...prev, [currentPage]: filtered };
    });
  }, [currentPage]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool === 'none' || activeTool === 'pointer') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getCanvasPoint(e);
    if (!pt) return;

    if (activeTool === 'eraser') {
      eraseAt(pt);
      setIsDrawing(true);
      return;
    }

    const newStroke: AnnotationStroke = {
      id: `${Date.now()}-${Math.random()}`,
      tool: activeTool,
      color: activeTool === 'pen' ? penColor : highlightColor,
      width: activeTool === 'pen' ? penSize * 2 : penSize * 10,
      alpha: activeTool === 'highlighter' ? 0.35 : 1,
      points: [pt],
    };
    setCurrentStroke(newStroke);
    setIsDrawing(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const canvas = annotationCanvasRef.current;

    if (activeTool === 'pointer') {
      const rect = canvas?.getBoundingClientRect();
      if (rect) {
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        setLaserPos({ x, y });
      }
      return;
    }

    if (!isDrawing) return;
    const pt = getCanvasPoint(e);
    if (!pt) return;

    if (activeTool === 'eraser') {
      eraseAt(pt);
      return;
    }

    if (!currentStroke || !canvas) return;
    const updatedStroke = { ...currentStroke, points: [...currentStroke.points, pt] };
    setCurrentStroke(updatedStroke);

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    redrawAnnotations(currentPage, canvas);
    drawStroke(ctx, updatedStroke, canvas.width, canvas.height);
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentStroke && currentStroke.points.length >= 2) {
      setAnnotations((prev) => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), currentStroke],
      }));
    }
    setCurrentStroke(null);
  };

  const clearAnnotations = () => {
    setAnnotations((prev) => ({ ...prev, [currentPage]: [] }));
    if (annotationCanvasRef.current) {
      const ctx = annotationCanvasRef.current.getContext('2d')!;
      ctx.clearRect(0, 0, annotationCanvasRef.current.width, annotationCanvasRef.current.height);
    }
  };

  // ─────────────────────────── Navigation ───────────────────────────
  const goTo = useCallback((page: number) => {
    if (!pdfDocRef.current) return;
    const clamped = Math.max(1, Math.min(pdfDocRef.current.numPages, page));
    setCurrentPage(clamped);
    setPageInputValue(String(clamped));
  }, []);

  const goNext = useCallback(() => goTo(currentPageRef.current + 1), [goTo]);
  const goPrev = useCallback(() => goTo(currentPageRef.current - 1), [goTo]);
  const goFirst = useCallback(() => goTo(1), [goTo]);
  const goLast = useCallback(() => {
    if (pdfDocRef.current) goTo(pdfDocRef.current.numPages);
  }, [goTo]);

  // ─────────────────────────── Keyboard ─────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          goPrev();
          break;
        case 'Home':
          e.preventDefault();
          goFirst();
          break;
        case 'End':
          e.preventDefault();
          goLast();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
          break;
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if (activeTool !== 'none') {
            setActiveTool('none');
          } else {
            onClose();
          }
          break;
        case '+': case '=':
          e.preventDefault();
          setZoom((z) => Math.min(200, z + 15));
          break;
        case '-':
          e.preventDefault();
          setZoom((z) => Math.max(50, z - 15));
          break;
        case '0':
          e.preventDefault();
          setZoom(100);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, activeTool, goNext, goPrev, goFirst, goLast, onClose]);

  // ─────────────────────────── Fullscreen ───────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ─────────────────────────── Touch Swipe ──────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > 60 && dy < 80) {
      if (dx < 0) goNext(); else goPrev();
    }
  };

  // ─────────────────────────── Derived ──────────────────────────────
  const hasAnnotations = useMemo(() => (annotations[currentPage] || []).length > 0, [annotations, currentPage]);

  const annotationCursor = useMemo(() => {
    if (activeTool === 'pointer') return 'cursor-crosshair';
    if (activeTool === 'pen' || activeTool === 'highlighter') return 'cursor-crosshair';
    if (activeTool === 'eraser') return 'cursor-cell';
    return 'cursor-default';
  }, [activeTool]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none"
      style={{ background: '#FFFDF5', fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
    >
      {/* ════════════════════════ TOP TOOLBAR ════════════════════════ */}
      <header
        className="shrink-0 flex items-center justify-between px-3 sm:px-5 gap-2"
        style={{
          background: '#FFD93D',
          height: '56px',
          borderBottom: '4px solid #000',
          boxShadow: '0 4px 0 0 #000',
          zIndex: 10,
        }}
      >
        {/* Left: File name */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="shrink-0 w-9 h-9 flex items-center justify-center font-black text-xs uppercase"
            style={{ background: '#FF6B6B', border: '4px solid #000', boxShadow: '3px 3px 0 0 #000' }}
          >
            PDF
          </div>
          <span className="text-sm font-bold uppercase tracking-tight text-black truncate max-w-[140px] sm:max-w-xs">
            {file.originalName}
          </span>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Zoom */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-1" style={{ border: '4px solid #000', background: '#fff', boxShadow: '2px 2px 0 0 #000' }}>
            <button onClick={() => setZoom((z) => Math.max(50, z - 15))} className="p-0.5 hover:text-red-600 transition-colors" title="Zoom out (-)">
              <ZoomOut className="w-4 h-4" strokeWidth={3} />
            </button>
            <span className="font-black text-xs tabular-nums w-10 text-center">{zoom}%</span>
            <button onClick={() => setZoom((z) => Math.min(200, z + 15))} className="p-0.5 hover:text-red-600 transition-colors" title="Zoom in (+)">
              <ZoomIn className="w-4 h-4" strokeWidth={3} />
            </button>
            <button onClick={() => setZoom(100)} className="p-0.5 text-zinc-400 hover:text-black transition-colors" title="Reset zoom (0)">
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={3} />
            </button>
          </div>

          {/* Thumbnails toggle */}
          <button
            onClick={() => setShowThumbnails((s) => !s)}
            title="Toggle slide panel"
            className="p-2 transition-all active:translate-x-[2px] active:translate-y-[2px]"
            style={{
              border: '4px solid #000',
              background: showThumbnails ? '#FF6B6B' : '#fff',
              boxShadow: showThumbnails ? 'none' : '3px 3px 0 0 #000',
              transform: showThumbnails ? 'translate(3px,3px)' : undefined,
            }}
          >
            <LayoutGrid className="w-4 h-4" strokeWidth={3} />
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => {
              if (!document.fullscreenElement) containerRef.current?.requestFullscreen().catch(() => {});
              else document.exitFullscreen().catch(() => {});
            }}
            title="Toggle fullscreen (F)"
            className="p-2 transition-all active:translate-x-[2px] active:translate-y-[2px]"
            style={{ border: '4px solid #000', background: '#fff', boxShadow: '3px 3px 0 0 #000' }}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" strokeWidth={3} /> : <Maximize2 className="w-4 h-4" strokeWidth={3} />}
          </button>

          {/* Download */}
          <button
            onClick={onDownload}
            title="Download original PDF"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 font-black text-xs uppercase tracking-wide transition-all active:translate-x-[2px] active:translate-y-[2px]"
            style={{ border: '4px solid #000', background: '#C4B5FD', boxShadow: '3px 3px 0 0 #000' }}
          >
            <Download className="w-3.5 h-3.5" strokeWidth={3} />
            <span>Save</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="p-2 transition-all active:translate-x-[2px] active:translate-y-[2px]"
            style={{ border: '4px solid #000', background: '#fff', boxShadow: '3px 3px 0 0 #000' }}
          >
            <X className="w-4 h-4" strokeWidth={3} />
          </button>
        </div>
      </header>

      {/* ════════════════════════ MAIN STAGE ════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Thumbnail Sidebar ── */}
        {showThumbnails && (
          <aside
            className="w-52 shrink-0 flex flex-col overflow-hidden"
            style={{ background: '#FFFDF5', borderRight: '4px solid #000' }}
          >
            <div
              className="px-3 py-2 font-black text-[11px] uppercase tracking-widest"
              style={{ background: '#C4B5FD', borderBottom: '4px solid #000' }}
            >
              Pages · {totalPages}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                const isActive = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    onClick={() => goTo(pageNum)}
                    className="w-full text-left transition-all duration-100"
                    style={{
                      border: isActive ? '4px solid #FF6B6B' : '4px solid #000',
                      background: isActive ? '#FFD93D' : '#fff',
                      boxShadow: isActive ? '4px 4px 0 0 #FF6B6B' : '4px 4px 0 0 #000',
                      transform: isActive ? 'translate(-2px, -2px)' : undefined,
                    }}
                  >
                    {thumbnails[pageNum] ? (
                      <img src={thumbnails[pageNum]} alt={`Page ${pageNum}`} className="w-full block" draggable={false} />
                    ) : (
                      <div className="w-full aspect-[4/3] flex items-center justify-center text-xs font-bold text-zinc-400" style={{ background: '#f5f5f5' }}>
                        {pageNum}
                      </div>
                    )}
                    <div className="px-2 py-1 font-black text-[10px] uppercase tracking-wider" style={{ borderTop: '2px solid #000' }}>
                      {isActive && <span className="text-red-600 mr-1">▶</span>}
                      Page {pageNum}
                      {(annotations[pageNum]?.length ?? 0) > 0 && (
                        <span className="ml-1" style={{ color: '#FF6B6B' }}>●</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        {/* ── PDF Viewport ── */}
        <main
          className="flex-1 relative overflow-auto flex items-center justify-center p-4"
          style={{
            background: '#e5e5e5',
            backgroundImage: 'radial-gradient(#999 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {isLoading && (
            <div className="flex flex-col items-center gap-4 z-10">
              <div
                className="w-20 h-20 flex items-center justify-center font-black text-2xl animate-bounce"
                style={{ background: '#FFD93D', border: '8px solid #000', boxShadow: '6px 6px 0 0 #000' }}
              >
                PDF
              </div>
              <p className="font-black text-sm uppercase tracking-widest text-black">Loading presentation...</p>
            </div>
          )}

          {loadError && (
            <div className="max-w-sm p-6" style={{ background: '#FF6B6B', border: '4px solid #000', boxShadow: '8px 8px 0 0 #000' }}>
              <p className="font-black text-base uppercase text-black">{loadError}</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 font-black text-sm uppercase transition-all active:translate-x-[2px] active:translate-y-[2px]"
                style={{ background: '#fff', border: '4px solid #000', boxShadow: '4px 4px 0 0 #000' }}
              >
                Close
              </button>
            </div>
          )}

          {!isLoading && !loadError && (
            <div
              className="relative"
              style={{ filter: 'drop-shadow(8px 8px 0px #000)' }}
            >
              {/* PDF Render Canvas */}
              <canvas
                ref={canvasRef}
                className="block max-w-full"
                style={{ imageRendering: 'crisp-edges', display: 'block' }}
              />

              {/* Annotation Canvas Overlay */}
              <canvas
                ref={annotationCanvasRef}
                className={`absolute inset-0 w-full h-full ${annotationCursor}`}
                style={{
                  touchAction: (activeTool !== 'none' && activeTool !== 'pointer') ? 'none' : 'auto',
                  pointerEvents: activeTool !== 'none' ? 'auto' : 'none',
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={() => {
                  setLaserPos(null);
                  if (isDrawing) handlePointerUp();
                }}
              />

              {/* Laser Dot Overlay */}
              {activeTool === 'pointer' && laserPos && (
                <div
                  className="laser-dot pointer-events-none"
                  style={{ left: `${laserPos.x}px`, top: `${laserPos.y}px` }}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* ════════════════════════ BOTTOM TOOLBAR ════════════════════════ */}
      <footer
        className="shrink-0 flex items-center gap-1 sm:gap-2 px-3 sm:px-5 overflow-x-auto"
        style={{
          height: '60px',
          background: '#FFFDF5',
          borderTop: '4px solid #000',
          boxShadow: '0 -4px 0 0 #000',
          zIndex: 10,
        }}
      >
        {/* ── Navigation ── */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={goFirst}
            disabled={currentPage <= 1}
            title="First page (Home)"
            className="p-2 transition-all active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-30"
            style={{ border: '4px solid #000', background: '#fff', boxShadow: currentPage > 1 ? '3px 3px 0 0 #000' : 'none' }}
          >
            <ChevronsLeft className="w-4 h-4" strokeWidth={3} />
          </button>
          <button
            onClick={goPrev}
            disabled={currentPage <= 1}
            title="Previous page (←)"
            className="p-2 transition-all active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-30"
            style={{ border: '4px solid #000', background: '#fff', boxShadow: currentPage > 1 ? '3px 3px 0 0 #000' : 'none' }}
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={3} />
          </button>

          {/* Page number input */}
          <div className="flex items-center gap-1 px-2" style={{ border: '4px solid #000', background: '#fff', boxShadow: '3px 3px 0 0 #000', height: '40px' }}>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const n = parseInt(pageInputValue, 10);
                  if (!isNaN(n)) goTo(n);
                }
              }}
              onBlur={() => {
                const n = parseInt(pageInputValue, 10);
                if (!isNaN(n)) goTo(n);
                else setPageInputValue(String(currentPage));
              }}
              className="w-10 text-center font-black text-sm outline-none bg-transparent"
              style={{ fontFamily: 'inherit' }}
            />
            <span className="font-bold text-xs text-zinc-500">/ {totalPages}</span>
          </div>

          <button
            onClick={goNext}
            disabled={currentPage >= totalPages}
            title="Next page (→)"
            className="p-2 transition-all active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-30"
            style={{ border: '4px solid #000', background: '#fff', boxShadow: currentPage < totalPages ? '3px 3px 0 0 #000' : 'none' }}
          >
            <ChevronRight className="w-4 h-4" strokeWidth={3} />
          </button>
          <button
            onClick={goLast}
            disabled={currentPage >= totalPages}
            title="Last page (End)"
            className="p-2 transition-all active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-30"
            style={{ border: '4px solid #000', background: '#fff', boxShadow: currentPage < totalPages ? '3px 3px 0 0 #000' : 'none' }}
          >
            <ChevronsRight className="w-4 h-4" strokeWidth={3} />
          </button>
        </div>

        {/* ── Divider ── */}
        <div className="w-0.5 h-8 bg-black mx-1 shrink-0" />

        {/* ── Tools ── */}
        <div className="flex items-center gap-1 shrink-0">
          <ToolButton icon={<MousePointer2 className="w-4 h-4" strokeWidth={3} />} label="Pointer" active={activeTool === 'pointer'} activeColor="#FF6B6B" onClick={() => setActiveTool((t) => t === 'pointer' ? 'none' : 'pointer')} />
          <ToolButton icon={<Pencil className="w-4 h-4" strokeWidth={3} />} label="Pen" active={activeTool === 'pen'} activeColor="#FF6B6B" onClick={() => setActiveTool((t) => t === 'pen' ? 'none' : 'pen')} />
          <ToolButton icon={<Highlighter className="w-4 h-4" strokeWidth={3} />} label="Mark" active={activeTool === 'highlighter'} activeColor="#FFD93D" onClick={() => setActiveTool((t) => t === 'highlighter' ? 'none' : 'highlighter')} />
          <ToolButton icon={<Eraser className="w-4 h-4" strokeWidth={3} />} label="Erase" active={activeTool === 'eraser'} activeColor="#C4B5FD" onClick={() => setActiveTool((t) => t === 'eraser' ? 'none' : 'eraser')} />
          {hasAnnotations && (
            <button
              onClick={clearAnnotations}
              title="Clear annotations"
              className="p-2 transition-all active:translate-x-[2px] active:translate-y-[2px] shrink-0"
              style={{ border: '4px solid #000', background: '#fecaca', boxShadow: '3px 3px 0 0 #000' }}
            >
              <Trash2 className="w-4 h-4" strokeWidth={3} />
            </button>
          )}
        </div>

        {/* ── Pen Color Picker ── */}
        {activeTool === 'pen' && (
          <>
            <div className="w-0.5 h-8 bg-black mx-1 shrink-0" />
            <div className="flex items-center gap-1 shrink-0">
              {PEN_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setPenColor(c)}
                  title={c}
                  className="w-6 h-6 transition-all"
                  style={{
                    background: c,
                    border: '3px solid #000',
                    boxShadow: penColor === c ? 'inset 0 0 0 2px #fff, 2px 2px 0 0 #000' : '2px 2px 0 0 #000',
                    transform: penColor === c ? 'scale(1.3)' : undefined,
                  }}
                />
              ))}
              <div className="flex items-center gap-0.5 px-1.5 ml-1" style={{ border: '3px solid #000', background: '#fff', boxShadow: '2px 2px 0 0 #000', height: '28px' }}>
                <button onClick={() => setPenSize((s) => Math.max(1, s - 1))} className="font-black text-sm w-5 leading-none">−</button>
                <span className="font-black text-xs w-4 text-center">{penSize}</span>
                <button onClick={() => setPenSize((s) => Math.min(12, s + 1))} className="font-black text-sm w-5 leading-none">+</button>
              </div>
            </div>
          </>
        )}

        {/* ── Highlight Color Picker ── */}
        {activeTool === 'highlighter' && (
          <>
            <div className="w-0.5 h-8 bg-black mx-1 shrink-0" />
            <div className="flex items-center gap-1 shrink-0">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setHighlightColor(c)}
                  title={c}
                  className="w-6 h-6 transition-all"
                  style={{
                    background: c,
                    border: '3px solid #000',
                    boxShadow: highlightColor === c ? 'inset 0 0 0 2px #fff, 2px 2px 0 0 #000' : '2px 2px 0 0 #000',
                    transform: highlightColor === c ? 'scale(1.3)' : undefined,
                  }}
                />
              ))}
            </div>
          </>
        )}

        <div className="flex-1" />

        {/* Mobile download */}
        <button
          onClick={onDownload}
          className="sm:hidden p-2 transition-all active:translate-x-[2px] active:translate-y-[2px] shrink-0"
          style={{ border: '4px solid #000', background: '#C4B5FD', boxShadow: '3px 3px 0 0 #000' }}
          title="Download"
        >
          <Download className="w-4 h-4" strokeWidth={3} />
        </button>

        {/* Keyboard hint */}
        <span className="hidden lg:block font-bold text-[10px] uppercase tracking-widest text-zinc-400 shrink-0">
          ← → Navigate · F Fullscreen · Esc Close
        </span>
      </footer>
    </div>
  );
};
