import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, ChevronLeft, ChevronRight, Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFullscreen } from "@/hooks/use-fullscreen";

/** Video viewer with frame-step controls (1/30s nudges), scrubber, mute, fullscreen. */
export function VideoViewer({ src, caption, className }: { src: string; caption?: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const fs = useFullscreen<HTMLDivElement>();
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const fn = () => setT(v.currentTime);
    const md = () => setDur(v.duration || 0);
    v.addEventListener("timeupdate", fn);
    v.addEventListener("loadedmetadata", md);
    return () => {
      v.removeEventListener("timeupdate", fn);
      v.removeEventListener("loadedmetadata", md);
    };
  }, []);

  const step = (delta: number) => {
    const v = ref.current; if (!v) return;
    v.pause(); setPlaying(false);
    v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + delta));
  };
  const toggle = () => {
    const v = ref.current; if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  return (
    <div
      ref={fs.ref}
      className={cn(
        "rounded-xl overflow-hidden bg-black border border-border/40",
        fs.isFullscreen && "fixed inset-0 z-[9999] rounded-none w-screen h-screen flex flex-col",
        className,
      )}
    >
      <div className={cn("relative bg-black", fs.isFullscreen ? "flex-1" : "aspect-video")}>
        <video
          ref={ref}
          src={src}
          className="w-full h-full object-contain"
          muted={muted}
          playsInline
          onClick={toggle}
        />
        {caption && (
          <div className="absolute top-3 left-3 text-[0.65rem] font-mono uppercase tracking-wider text-white/70 bg-black/40 backdrop-blur px-2 py-0.5 rounded">
            {caption}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 h-12 px-2 bg-[hsl(195_40%_6%)] text-white">
        <Button variant="ghost" size="sm" onClick={toggle} className="h-8 w-8 p-0 text-white/85 hover:bg-white/10">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => step(-1 / 30)} className="h-8 w-8 p-0 text-white/85 hover:bg-white/10" title="Previous frame">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => step(1 / 30)} className="h-8 w-8 p-0 text-white/85 hover:bg-white/10" title="Next frame">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <input
          type="range"
          min={0}
          max={dur || 0}
          step={0.01}
          value={t}
          onChange={(e) => { const v = ref.current; if (v) v.currentTime = Number(e.target.value); }}
          className="flex-1 accent-primary"
          aria-label="Scrub"
        />
        <span className="font-mono text-[0.7rem] text-white/70 w-16 text-right">
          {fmt(t)} / {fmt(dur)}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setMuted((m) => !m)} className="h-8 w-8 p-0 text-white/85 hover:bg-white/10">
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
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
  );
}

function fmt(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
