import { useEffect, useId, useRef, useState } from "react";
import {
  RenderingEngine,
  Enums,
  init as csInit,
  imageLoader,
  metaData,
  volumeLoader,
  setVolumesForViewports,
  type Types,
} from "@cornerstonejs/core";
import {
  init as csToolsInit,
  ToolGroupManager,
  Enums as csToolsEnums,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  StackScrollTool,
  LengthTool,
  AngleTool,
  EllipticalROITool,
  RectangleROITool,
  ProbeTool,
  addTool,
} from "@cornerstonejs/tools";
import * as cornerstoneDICOMImageLoader from "@cornerstonejs/dicom-image-loader";
import dicomParser from "dicom-parser";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFullscreen } from "@/hooks/use-fullscreen";
import {
  Maximize2,
  Minimize2,
  Move,
  ZoomIn,
  Sun,
  Layers,
  Ruler,
  Triangle,
  Circle,
  Square,
  Crosshair,
  RotateCcw,
  Play,
  Pause,
  Box,
} from "lucide-react";

type ToolName =
  | "Pan"
  | "Zoom"
  | "WindowLevel"
  | "StackScroll"
  | "Length"
  | "Angle"
  | "EllipticalROI"
  | "RectangleROI"
  | "Probe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = any;
const TOOL_REGISTRY: { id: ToolName; label: string; icon: React.ReactNode; tool: AnyTool }[] = [
  { id: "Pan", label: "Pan", icon: <Move className="h-4 w-4" />, tool: PanTool },
  { id: "Zoom", label: "Zoom", icon: <ZoomIn className="h-4 w-4" />, tool: ZoomTool },
  { id: "WindowLevel", label: "Window/Level", icon: <Sun className="h-4 w-4" />, tool: WindowLevelTool },
  { id: "StackScroll", label: "Scroll slices", icon: <Layers className="h-4 w-4" />, tool: StackScrollTool },
  { id: "Length", label: "Length", icon: <Ruler className="h-4 w-4" />, tool: LengthTool },
  { id: "Angle", label: "Angle", icon: <Triangle className="h-4 w-4" />, tool: AngleTool },
  { id: "EllipticalROI", label: "Ellipse ROI", icon: <Circle className="h-4 w-4" />, tool: EllipticalROITool },
  { id: "RectangleROI", label: "Rectangle ROI", icon: <Square className="h-4 w-4" />, tool: RectangleROITool },
  { id: "Probe", label: "Probe (HU)", icon: <Crosshair className="h-4 w-4" />, tool: ProbeTool },
];

/** W/L presets per modality region. */
export const WL_PRESETS = [
  { label: "Soft tissue", ww: 400, wc: 40 },
  { label: "Lung", ww: 1500, wc: -600 },
  { label: "Bone", ww: 1500, wc: 300 },
  { label: "Brain", ww: 80, wc: 40 },
  { label: "Abdomen", ww: 400, wc: 50 },
  { label: "Mediastinum", ww: 350, wc: 40 },
  { label: "Liver", ww: 150, wc: 30 },
];

let csInitialized = false;
async function ensureCornerstoneInit() {
  if (csInitialized) return;
  await csInit();
  await csToolsInit();
  cornerstoneDICOMImageLoader.init({ maxWebWorkers: navigator.hardwareConcurrency || 2 });
  // Register tools once
  [PanTool, ZoomTool, WindowLevelTool, StackScrollTool, LengthTool, AngleTool, EllipticalROITool, RectangleROITool, ProbeTool].forEach((t) => {
    try { addTool(t); } catch { /* already added */ }
  });
  csInitialized = true;
}

export interface CornerstoneViewerProps {
  /** Image URLs. For DICOM, use `wadouri:https://...` prefix. For non-DICOM raster images, use plain http(s) URL. */
  imageIds: string[];
  /** Show MPR (axial/coronal/sagittal) — only useful for true volumetric DICOM series. */
  mpr?: boolean;
  /** Optional caption shown in the corner chip. */
  caption?: string;
  className?: string;
  /** When true, allows cine playback for stack viewer. */
  cine?: boolean;
}

/**
 * Production-grade DICOM viewer powered by Cornerstone3D + dicom-parser.
 * Falls back gracefully when imageIds are non-DICOM raster URLs (e.g. JPEG previews).
 */
export function CornerstoneViewer({ imageIds, mpr = false, caption, className, cine = true }: CornerstoneViewerProps) {
  const id = useId().replace(/[:]/g, "");
  const renderingEngineId = `re-${id}`;
  const toolGroupId = `tg-${id}`;
  const stackViewportId = `vp-stack-${id}`;
  const axialId = `vp-axial-${id}`;
  const coronalId = `vp-coronal-${id}`;
  const sagittalId = `vp-sagittal-${id}`;
  const volumeId = `cornerstoneStreamingImageVolume:vol-${id}`;

  const fs = useFullscreen<HTMLDivElement>();
  const stackRef = useRef<HTMLDivElement>(null);
  const axialRef = useRef<HTMLDivElement>(null);
  const coronalRef = useRef<HTMLDivElement>(null);
  const sagittalRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RenderingEngine | null>(null);
  const cineRef = useRef<number | null>(null);

  const [activeTool, setActiveTool] = useState<ToolName>("WindowLevel");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showMpr, setShowMpr] = useState(mpr);
  const [sliceIdx, setSliceIdx] = useState(0);

  // ── Init engine + viewports ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureCornerstoneInit();
        if (cancelled) return;

        const engine = new RenderingEngine(renderingEngineId);
        engineRef.current = engine;

        const viewportInputs: Types.PublicViewportInput[] = [];
        if (stackRef.current) {
          viewportInputs.push({
            viewportId: stackViewportId,
            type: Enums.ViewportType.STACK,
            element: stackRef.current,
            defaultOptions: { background: [0.016, 0.039, 0.047] as [number, number, number] },
          });
        }
        if (showMpr && axialRef.current && coronalRef.current && sagittalRef.current) {
          (["AXIAL", "CORONAL", "SAGITTAL"] as const).forEach((orientation, i) => {
            const el = [axialRef, coronalRef, sagittalRef][i].current!;
            const vid = [axialId, coronalId, sagittalId][i];
            viewportInputs.push({
              viewportId: vid,
              type: Enums.ViewportType.ORTHOGRAPHIC,
              element: el,
              defaultOptions: {
                orientation: Enums.OrientationAxis[orientation],
                background: [0.016, 0.039, 0.047] as [number, number, number],
              },
            });
          });
        }

        engine.setViewports(viewportInputs);

        // Tool group
        let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
        if (!toolGroup) {
          toolGroup = ToolGroupManager.createToolGroup(toolGroupId)!;
          TOOL_REGISTRY.forEach((t) => toolGroup!.addTool(t.id));
          // Default bindings
          toolGroup.setToolActive("WindowLevel", { bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }] });
          toolGroup.setToolActive("Pan", { bindings: [{ mouseButton: csToolsEnums.MouseBindings.Auxiliary }] });
          toolGroup.setToolActive("Zoom", { bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }] });
          toolGroup.setToolActive("StackScroll", { bindings: [{ mouseButton: csToolsEnums.MouseBindings.Wheel }] });
        }
        viewportInputs.forEach((v) => toolGroup!.addViewport(v.viewportId, renderingEngineId));

        // Load images
        if (showMpr && imageIds.length >= 4) {
          // Volume path (true 3D MPR)
          const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
          await (volume as unknown as { load: () => Promise<void> }).load();
          await setVolumesForViewports(engine, [{ volumeId }], [axialId, coronalId, sagittalId]);
        } else {
          const stackVp = engine.getViewport(stackViewportId) as Types.IStackViewport;
          await stackVp.setStack(imageIds, 0);
        }
        engine.renderViewports(viewportInputs.map((v) => v.viewportId));
        if (!cancelled) setReady(true);
      } catch (err) {
        console.error("Cornerstone init failed:", err);
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to initialise viewer.");
      }
    })();

    return () => {
      cancelled = true;
      if (cineRef.current) {
        window.clearInterval(cineRef.current);
        cineRef.current = null;
      }
      try { ToolGroupManager.destroyToolGroup(toolGroupId); } catch { /* noop */ }
      try { engineRef.current?.destroy(); } catch { /* noop */ }
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageIds.join("|"), showMpr]);

  // Tool switching
  const onSelectTool = (name: ToolName) => {
    const tg = ToolGroupManager.getToolGroup(toolGroupId);
    if (!tg) return;
    // Disable other primary tools
    TOOL_REGISTRY.forEach((t) => {
      if (t.id !== "Pan" && t.id !== "Zoom" && t.id !== "StackScroll") {
        try { tg.setToolPassive(t.id); } catch { /* noop */ }
      }
    });
    tg.setToolActive(name, { bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }] });
    setActiveTool(name);
  };

  // W/L preset
  const applyPreset = (ww: number, wc: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    [stackViewportId, axialId, coronalId, sagittalId].forEach((vid) => {
      try {
        const vp = engine.getViewport(vid);
        if (!vp) return;
        if ((vp as Types.IStackViewport).setProperties) {
          (vp as Types.IStackViewport).setProperties({ voiRange: { lower: wc - ww / 2, upper: wc + ww / 2 } });
          vp.render();
        }
      } catch { /* viewport doesn't exist */ }
    });
  };

  const reset = () => {
    const engine = engineRef.current;
    if (!engine) return;
    [stackViewportId, axialId, coronalId, sagittalId].forEach((vid) => {
      try {
        const vp = engine.getViewport(vid);
        vp?.resetCamera();
        vp?.render();
      } catch { /* noop */ }
    });
  };

  // Cine
  const toggleCine = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const vp = engine.getViewport(stackViewportId) as Types.IStackViewport | undefined;
    if (!vp) return;
    if (cineRef.current) {
      window.clearInterval(cineRef.current);
      cineRef.current = null;
      setPlaying(false);
      return;
    }
    setPlaying(true);
    cineRef.current = window.setInterval(() => {
      const idx = vp.getCurrentImageIdIndex();
      const next = (idx + 1) % imageIds.length;
      vp.setImageIdIndex(next).then(() => setSliceIdx(next));
    }, 100);
  };

  // ── Render ──────────────────────────────────────────────────
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
      <div className="flex items-center gap-1 px-2 border-b border-white/10 bg-[hsl(195_40%_6%)] h-12 overflow-x-auto scrollbar-thin">
        {TOOL_REGISTRY.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelectTool(t.id)}
            title={t.label}
            aria-label={t.label}
            className={cn(
              "h-8 w-8 p-0 text-white/80 hover:bg-white/10 hover:text-white",
              activeTool === t.id && "bg-primary/30 text-white ring-1 ring-primary/60",
            )}
          >
            {t.icon}
          </Button>
        ))}
        <div className="w-px h-5 bg-white/10 mx-1" />
        {WL_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.ww, p.wc)}
            className="text-[0.65rem] font-mono uppercase tracking-wider px-2 h-7 rounded hover:bg-white/10 text-white/70 hover:text-white whitespace-nowrap"
            title={`W:${p.ww} L:${p.wc}`}
          >
            {p.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={reset} className="h-8 w-8 p-0 text-white/80 hover:bg-white/10" title="Reset">
            <RotateCcw className="h-4 w-4" />
          </Button>
          {imageIds.length > 1 && cine && (
            <Button variant="ghost" size="sm" onClick={toggleCine} className="h-8 w-8 p-0 text-white/80 hover:bg-white/10" title="Cine">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          )}
          {imageIds.length >= 4 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMpr((v) => !v)}
              className={cn(
                "h-8 w-8 p-0 text-white/80 hover:bg-white/10",
                showMpr && "bg-primary/30 ring-1 ring-primary/60",
              )}
              title="MPR (axial · coronal · sagittal)"
            >
              <Box className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={fs.toggle} className="h-8 w-8 p-0 text-white/80 hover:bg-white/10">
            {fs.isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Viewports */}
      <div className={cn("relative flex-1 min-h-[280px] md:min-h-[480px] grid", showMpr && imageIds.length >= 4 ? "grid-cols-2 grid-rows-2 gap-1 bg-[hsl(195_40%_3%)]" : "")}>
        {showMpr && imageIds.length >= 4 ? (
          <>
            <ViewportPane refEl={axialRef} label="Axial" />
            <ViewportPane refEl={coronalRef} label="Coronal" />
            <ViewportPane refEl={sagittalRef} label="Sagittal" />
            <div className="bg-[hsl(195_40%_4%)] flex items-center justify-center text-[0.7rem] text-white/40 font-mono">
              {caption ?? "MPR view"}
            </div>
          </>
        ) : (
          <ViewportPane refEl={stackRef} label={caption ?? "Image"} />
        )}

        {error && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center text-center p-6">
            <div>
              <div className="text-sm text-warning-critical-foreground font-medium">Viewer error</div>
              <div className="text-xs text-white/60 mt-1 max-w-sm">{error}</div>
            </div>
          </div>
        )}
        {!ready && !error && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="text-xs text-white/60 font-mono uppercase tracking-wider">Loading study…</div>
          </div>
        )}
      </div>

      {/* Footer */}
      {imageIds.length > 1 && !showMpr && (
        <div className="flex items-center gap-3 h-9 px-3 bg-[hsl(195_40%_6%)] border-t border-white/10 text-[0.65rem] font-mono text-white/60">
          <span>Slice {sliceIdx + 1} / {imageIds.length}</span>
          <input
            type="range"
            min={0}
            max={imageIds.length - 1}
            value={sliceIdx}
            onChange={async (e) => {
              const n = Number(e.target.value);
              setSliceIdx(n);
              const vp = engineRef.current?.getViewport(stackViewportId) as Types.IStackViewport | undefined;
              await vp?.setImageIdIndex(n);
            }}
            className="flex-1 accent-primary"
          />
        </div>
      )}
    </div>
  );
}

function ViewportPane({ refEl, label }: { refEl: React.RefObject<HTMLDivElement>; label: string }) {
  return (
    <div className="relative w-full h-full">
      <div ref={refEl} className="absolute inset-0" />
      <div className="absolute top-2 left-2 text-[0.6rem] font-mono uppercase tracking-wider text-white/50 pointer-events-none">
        {label}
      </div>
    </div>
  );
}

/**
 * Helper: convert an array of source URLs (or File objects via createObjectURL)
 * into properly prefixed Cornerstone imageIds. DICOM files use `wadouri:` so the
 * dicom-image-loader picks them up; everything else passes through as raster.
 */
export function toImageIds(sources: string[]): string[] {
  return sources.map((src) => {
    const lower = src.toLowerCase();
    if (lower.endsWith(".dcm") || lower.includes("dicom")) {
      return src.startsWith("wadouri:") ? src : `wadouri:${src}`;
    }
    return src;
  });
}
