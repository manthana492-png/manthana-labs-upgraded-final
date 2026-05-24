import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useFullscreen } from "@/hooks/use-fullscreen";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sun,
  Contrast,
  ChevronLeft,
  ChevronRight,
  Move,
  Layers,
} from "lucide-react";

/**
 * DicomViewer
 * ─────────────────────────────────────────────────────────────────────
 * A canvas-based 2D medical image viewer that mirrors the cornerstone.js
 * UX (zoom, pan, window/level, fullscreen, multi-frame stepping) without
 * the 1.5MB+ legacy dependency. Works on any rasterised image; will accept
 * a real DICOM-decoded ImageBitmap through the same pipeline.
 *
 * Mobile: pinch-to-zoom, single-finger pan, double-tap reset, fullscreen.
 * Desktop: scroll-zoom, click-drag pan, right-drag window/level, hotkeys.
 */
export interface DicomViewerProps {
  /** One or more image sources (frames). */
  sources: string[];
  /** Optional caption shown in the top-left chip. */
  caption?: string;
  /** Optional heatmap overlay layer (rendered on top with multiply blend). */
  heatmapSrc?: string;
  className?: string;
  /** Compact toolbar (no labels, smaller height). */
  compact?: boolean;
  /** Bounding boxes of regions of interest to render in normalized [0..1] coordinates. */
  rois?: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    label?: string;
    severity?: "low" | "medium" | "high" | "critical";
  }>;
}

export function DicomViewer({
  sources,
  caption,
  heatmapSrc,
  className,
  compact = false,
  rois,
}: DicomViewerProps) {
  const fs = useFullscreen<HTMLDivElement>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const [frame, setFrame] = useState(0);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [brightness, setBrightness] = useState(100); // 50..150
  const [contrast, setContrast] = useState(100);     // 50..200
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayImgRef = useRef<HTMLImageElement | null>(null);

  const safeFrame = Math.min(Math.max(frame, 0), Math.max(sources.length - 1, 0));
  const currentSrc = sources[safeFrame];

  // ── Load image ───────────────────────────────────────────────
  useEffect(() => {
    if (!currentSrc) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      requestAnimationFrame(draw);
    };
    img.src = currentSrc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSrc]);

  useEffect(() => {
    if (!heatmapSrc) {
      overlayImgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      overlayImgRef.current = img;
      requestAnimationFrame(draw);
    };
    img.src = heatmapSrc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmapSrc]);

  // ── Draw ─────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const img = imgRef.current;
    if (!wrap || !canvas || !img) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;

    [canvas, overlay].forEach((c) => {
      if (!c) return;
      c.width = cw * dpr;
      c.height = ch * dpr;
      c.style.width = `${cw}px`;
      c.style.height = `${ch}px`;
    });

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // contain fit
    const fit = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    const drawW = img.naturalWidth * fit * scale;
    const drawH = img.naturalHeight * fit * scale;
    const cx = (cw - drawW) / 2 + tx;
    const cy = (ch - drawH) / 2 + ty;

    ctx.imageSmoothingEnabled = scale < 4;
    ctx.imageSmoothingQuality = "high";
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.drawImage(img, cx, cy, drawW, drawH);
    ctx.filter = "none";

    // Heatmap overlay
    const oImg = overlayImgRef.current;
    const octx = overlay?.getContext("2d");
    if (octx && overlay) {
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, cw, ch);
      if (oImg && showHeatmap) {
        octx.globalAlpha = 0.55;
        octx.globalCompositeOperation = "screen";
        octx.drawImage(oImg, cx, cy, drawW, drawH);
        octx.globalAlpha = 1;
        octx.globalCompositeOperation = "source-over";
      }

      // Draw active ROIs/bounding boxes
      if (rois && rois.length > 0) {
        rois.forEach((roi) => {
          const rx = cx + roi.x * drawW;
          const ry = cy + roi.y * drawH;
          const rw = roi.w * drawW;
          const rh = roi.h * drawH;

          // Border color based on severity or default primary
          let color = "#7c3aed"; // primary
          if (roi.severity === "critical") color = "#ef4444";
          else if (roi.severity === "high") color = "#f97316";
          else if (roi.severity === "medium") color = "#eab308";
          else if (roi.severity === "low") color = "#22c55e";

          octx.strokeStyle = color;
          octx.lineWidth = 2.5;
          
          // Draw rectangle
          octx.strokeRect(rx, ry, rw, rh);

          // Optional label background + text
          if (roi.label) {
            octx.font = "bold 10px monospace";
            const tw = octx.measureText(roi.label).width;
            octx.fillStyle = color;
            octx.fillRect(rx, ry - 16, tw + 10, 16);
            octx.fillStyle = "#ffffff";
            octx.fillText(roi.label, rx + 5, ry - 5);
          }
        });
      }
    }
  }, [scale, tx, ty, brightness, contrast, showHeatmap, rois]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  // ── Interaction ──────────────────────────────────────────────
  const stateRef = useRef({
    dragging: false,
    mode: "pan" as "pan" | "wl",
    lastX: 0,
    lastY: 0,
    pinchDist: 0,
    lastTap: 0,
  });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    stateRef.current.dragging = true;
    stateRef.current.mode = e.button === 2 ? "wl" : "pan";
    stateRef.current.lastX = e.clientX;
    stateRef.current.lastY = e.clientY;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!stateRef.current.dragging) return;
    const dx = e.clientX - stateRef.current.lastX;
    const dy = e.clientY - stateRef.current.lastY;
    stateRef.current.lastX = e.clientX;
    stateRef.current.lastY = e.clientY;
    if (stateRef.current.mode === "wl") {
      setBrightness((b) => Math.max(50, Math.min(150, b + dy * -0.3)));
      setContrast((c) => Math.max(50, Math.min(200, c + dx * 0.4)));
    } else {
      setTx((v) => v + dx);
      setTy((v) => v + dy);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    stateRef.current.dragging = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setScale((s) => Math.max(0.5, Math.min(8, s * factor)));
  };

  // Touch / pinch
  const touchesRef = useRef<{ id: number; x: number; y: number }[]>([]);
  const onTouchStart = (e: React.TouchEvent) => {
    touchesRef.current = Array.from(e.touches).map((t) => ({
      id: t.identifier, x: t.clientX, y: t.clientY,
    }));
    if (e.touches.length === 2) {
      const [a, b] = e.touches as unknown as Touch[];
      stateRef.current.pinchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - stateRef.current.lastTap < 300) {
        reset();
      }
      stateRef.current.lastTap = now;
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches as unknown as Touch[];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = d / (stateRef.current.pinchDist || d);
      stateRef.current.pinchDist = d;
      setScale((s) => Math.max(0.5, Math.min(8, s * ratio)));
      e.preventDefault();
      return;
    }
    if (e.touches.length === 1 && touchesRef.current[0]) {
      const t = e.touches[0];
      const prev = touchesRef.current[0];
      setTx((v) => v + (t.clientX - prev.x));
      setTy((v) => v + (t.clientY - prev.y));
      touchesRef.current = [{ id: t.identifier, x: t.clientX, y: t.clientY }];
      e.preventDefault();
    }
  };

  // Hotkeys
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(8, s * 1.15));
      if (e.key === "-" || e.key === "_") setScale((s) => Math.max(0.5, s / 1.15));
      if (e.key === "0") reset();
      if (e.key === "ArrowRight") setFrame((f) => Math.min(sources.length - 1, f + 1));
      if (e.key === "ArrowLeft") setFrame((f) => Math.max(0, f - 1));
      if (e.key.toLowerCase() === "f") fs.toggle();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.length]);

  const reset = () => {
    setScale(1);
    setTx(0);
    setTy(0);
    setBrightness(100);
    setContrast(100);
  };

  // Fullscreen handled by useFullscreen() hook (fs.toggle / fs.isFullscreen)

  // ── Render ───────────────────────────────────────────────────
  return (
    <div
      ref={fs.ref}
      className={cn(
        "relative flex flex-col bg-[hsl(195_40%_4%)] text-white rounded-xl overflow-hidden border border-border/40 select-none",
        fs.isFullscreen && "fixed inset-0 z-[9999] rounded-none w-screen h-screen",
        className,
      )}
    >
      {/* Toolbar */}
      <div className={cn(
        "flex items-center gap-1 px-2 border-b border-white/10 bg-[hsl(195_40%_6%)]",
        compact ? "h-10" : "h-12",
      )}>
        <ToolbarBtn label="Zoom in" onClick={() => setScale((s) => Math.min(8, s * 1.2))}>
          <ZoomIn className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn label="Zoom out" onClick={() => setScale((s) => Math.max(0.5, s / 1.2))}>
          <ZoomOut className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn label="Reset" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
        </ToolbarBtn>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <ToolbarSlider
          icon={<Sun className="h-3.5 w-3.5" />}
          value={brightness}
          min={50} max={150}
          onChange={setBrightness}
          label="Brightness"
        />
        <ToolbarSlider
          icon={<Contrast className="h-3.5 w-3.5" />}
          value={contrast}
          min={50} max={200}
          onChange={setContrast}
          label="Contrast"
        />

        <div className="ml-auto flex items-center gap-1">
          {heatmapSrc && (
            <ToolbarBtn
              label={showHeatmap ? "Hide heatmap" : "Show heatmap"}
              active={showHeatmap}
              onClick={() => setShowHeatmap((v) => !v)}
            >
              <Layers className="h-4 w-4" />
            </ToolbarBtn>
          )}
          <ToolbarBtn label={fs.isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={fs.toggle}>
            {fs.isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </ToolbarBtn>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={wrapRef}
        className="relative flex-1 min-h-[280px] md:min-h-[420px] cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        role="img"
        aria-label={caption ?? "Medical image viewer"}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
        <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />

        {/* Top-left meta chip */}
        <div className="absolute top-3 left-3 text-[0.65rem] font-mono uppercase tracking-wider text-white/60 space-y-0.5 pointer-events-none">
          {caption && <div className="text-white/80">{caption}</div>}
          <div>{imgSize.w} × {imgSize.h}</div>
        </div>

        {/* Bottom-left readout */}
        <div className="absolute bottom-3 left-3 text-[0.65rem] font-mono text-white/60 space-y-0.5 pointer-events-none">
          <div>Z {scale.toFixed(2)}× · WL {Math.round(brightness)}/{Math.round(contrast)}</div>
        </div>

        {/* Frame counter */}
        {sources.length > 1 && (
          <div className="absolute top-3 right-3 text-[0.65rem] font-mono text-white/70 bg-black/40 backdrop-blur px-2 py-1 rounded pointer-events-none">
            {safeFrame + 1} / {sources.length}
          </div>
        )}

        {/* Mobile pan hint */}
        <div className="absolute bottom-3 right-3 text-[0.6rem] font-mono text-white/40 hidden sm:flex items-center gap-1 pointer-events-none">
          <Move className="h-3 w-3" /> drag · scroll-zoom · right-drag W/L
        </div>
      </div>

      {/* Frame stepper */}
      {sources.length > 1 && (
        <div className="flex items-center gap-2 h-10 border-t border-white/10 bg-[hsl(195_40%_6%)] px-2">
          <button
            onClick={() => setFrame((f) => Math.max(0, f - 1))}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-white/10"
            aria-label="Previous frame"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={0}
            max={sources.length - 1}
            value={safeFrame}
            onChange={(e) => setFrame(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <button
            onClick={() => setFrame((f) => Math.min(sources.length - 1, f + 1))}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-white/10"
            aria-label="Next frame"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Toolbar primitives ─────────────────────────────────────────
function ToolbarBtn({
  children, onClick, label, active,
}: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "h-8 w-8 p-0 text-white/80 hover:bg-white/10 hover:text-white",
        active && "bg-white/15 text-white",
      )}
    >
      {children}
    </Button>
  );
}

function ToolbarSlider({
  icon, value, min, max, onChange, label,
}: {
  icon: React.ReactNode; value: number; min: number; max: number;
  onChange: (v: number) => void; label: string;
}) {
  return (
    <div className="hidden sm:flex items-center gap-1.5 px-1.5 h-8 rounded text-white/70" title={label}>
      <span className="opacity-70">{icon}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 accent-primary"
        aria-label={label}
      />
    </div>
  );
}
