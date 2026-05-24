import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RotateCw, Pause, Play, Layers, Maximize2, Minimize2 } from "lucide-react";
import { useFullscreen } from "@/hooks/use-fullscreen";

/**
 * 3D volumetric viewer — pure CSS-3D implementation.
 * Renders a stack of slabs (rotated MIP-style) that the user can orbit
 * with click-drag or touch. No three.js dependency: keeps the bundle slim.
 *
 * Note: 3D modalities are currently locked behind a "Coming Soon" gate
 * in the catalog — this viewer is shown only on legacy studies.
 */
export function Volume3DViewer({
  src,
  className,
  caption = "3D Volume · MIP",
}: {
  src: string;
  className?: string;
  caption?: string;
}) {
  const fs = useFullscreen<HTMLDivElement>();
  const [rx, setRx] = useState(-22);
  const [ry, setRy] = useState(28);
  const [auto, setAuto] = useState(true);
  const [slabCount, setSlabCount] = useState(28);
  const dragRef = useRef({ active: false, x: 0, y: 0 });

  useEffect(() => {
    if (!auto) return;
    let raf = 0;
    const loop = () => {
      setRy((v) => (v + 0.25) % 360);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [auto]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { active: true, x: e.clientX, y: e.clientY };
    setAuto(false);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { active: true, x: e.clientX, y: e.clientY };
    setRy((v) => v + dx * 0.5);
    setRx((v) => Math.max(-80, Math.min(80, v - dy * 0.4)));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current.active = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const slabs = Array.from({ length: slabCount });

  return (
    <div
      ref={fs.ref}
      className={cn(
        "rounded-xl overflow-hidden bg-[hsl(195_40%_4%)] text-white border border-border/40",
        fs.isFullscreen && "fixed inset-0 z-[9999] rounded-none w-screen h-screen flex flex-col",
        className,
      )}
    >
      <div className="flex items-center gap-2 h-10 px-2 border-b border-white/10 bg-[hsl(195_40%_6%)] shrink-0">
        <span className="font-mono text-[0.65rem] tracking-wider uppercase text-white/70">{caption}</span>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[0.65rem] font-mono text-white/50 hidden sm:inline">slabs</span>
          <input
            type="range" min={12} max={48} value={slabCount}
            onChange={(e) => setSlabCount(Number(e.target.value))}
            className="w-20 accent-primary"
            aria-label="Slab density"
          />
          <Button variant="ghost" size="sm" onClick={() => setAuto((v) => !v)} className="h-8 w-8 p-0 text-white/85 hover:bg-white/10">
            {auto ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setRx(-22); setRy(28); }} className="h-8 w-8 p-0 text-white/85 hover:bg-white/10">
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={fs.toggle}
            className="h-8 w-8 p-0 text-white/85 hover:bg-white/10"
            aria-label={fs.isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            title={fs.isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fs.isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <div
        className={cn(
          "relative flex items-center justify-center cursor-grab active:cursor-grabbing touch-none overflow-hidden",
          fs.isFullscreen ? "flex-1" : "h-[360px] md:h-[440px]",
        )}
        style={{ perspective: "1200px" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Aurora glow */}
        <div className="absolute inset-0 opacity-50 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, hsl(184 70% 30% / 0.35), transparent 60%)" }}
        />
        <div
          className="relative"
          style={{
            width: 280,
            height: 280,
            transformStyle: "preserve-3d",
            transform: `rotateX(${rx}deg) rotateY(${ry}deg)`,
            transition: dragRef.current.active ? "none" : "transform 60ms linear",
          }}
        >
          {slabs.map((_, i) => {
            const z = (i - slabCount / 2) * 4;
            const a = 0.18 + (Math.sin((i / slabCount) * Math.PI) * 0.5);
            return (
              <div
                key={i}
                className="absolute inset-0 rounded-md"
                style={{
                  transform: `translateZ(${z}px)`,
                  backgroundImage: `url(${src})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  opacity: a,
                  mixBlendMode: "screen",
                  filter: "contrast(1.1) saturate(0.6)",
                }}
              />
            );
          })}
        </div>
        <div className="absolute bottom-3 left-3 text-[0.6rem] font-mono text-white/50 flex items-center gap-1 pointer-events-none">
          <Layers className="h-3 w-3" /> drag to orbit · {slabCount} slabs
        </div>
      </div>
    </div>
  );
}
