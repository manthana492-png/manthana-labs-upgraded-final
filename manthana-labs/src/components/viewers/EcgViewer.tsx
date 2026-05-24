import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Synthesized 12-lead ECG visualization rendered to canvas.
 * Designed to feel like clinical paper (rose-pink grid + dark trace).
 */
export function EcgViewer({ leads = 12, hr = 78, className }: { leads?: number; hr?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cnv = ref.current;
    if (!cnv) return;
    const ctx = cnv.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = cnv.getBoundingClientRect();
      cnv.width = rect.width * dpr;
      cnv.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    };

    const render = () => {
      const rect = cnv.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      ctx.clearRect(0, 0, W, H);

      // Paper background
      ctx.fillStyle = "#fff7f5";
      ctx.fillRect(0, 0, W, H);

      // Fine grid (1mm)
      ctx.strokeStyle = "rgba(220, 80, 80, 0.18)";
      ctx.lineWidth = 0.5;
      const small = 8;
      for (let x = 0; x < W; x += small) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += small) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // Coarse grid (5mm)
      ctx.strokeStyle = "rgba(220, 80, 80, 0.45)";
      ctx.lineWidth = 0.8;
      for (let x = 0; x < W; x += small * 5) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += small * 5) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Lead labels
      const rows = Math.min(leads, 4);
      const rowH = H / rows;
      const labels = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
      ctx.font = "10px ui-monospace, JetBrains Mono, monospace";
      ctx.fillStyle = "rgba(120, 30, 30, 0.85)";

      // Trace
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.2;
      for (let r = 0; r < rows; r++) {
        const baseY = rowH * r + rowH / 2;
        ctx.fillText(labels[r] ?? `L${r + 1}`, 6, rowH * r + 12);
        ctx.beginPath();
        const period = (60 / hr) * 100; // px per beat
        for (let x = 0; x < W; x++) {
          const phase = ((x + r * 23) % period) / period;
          let y = 0;
          // P
          if (phase > 0.05 && phase < 0.12) y = -Math.sin((phase - 0.05) / 0.07 * Math.PI) * 5;
          // QRS
          else if (phase > 0.16 && phase < 0.18) y = 4;
          else if (phase > 0.18 && phase < 0.21) y = -28;
          else if (phase > 0.21 && phase < 0.235) y = 14;
          // T
          else if (phase > 0.32 && phase < 0.45) y = -Math.sin((phase - 0.32) / 0.13 * Math.PI) * 8;

          // Tiny noise
          y += (Math.sin(x * 0.7 + r) * 0.4);

          if (x === 0) ctx.moveTo(x, baseY + y);
          else ctx.lineTo(x, baseY + y);
        }
        ctx.stroke();
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(cnv);
    resize();
    return () => ro.disconnect();
  }, [leads, hr]);

  return (
    <div className={cn("rounded-xl overflow-hidden border border-border/40 bg-white", className)}>
      <div className="flex items-center justify-between px-3 h-10 border-b border-border/40 bg-[hsl(195_40%_6%)] text-white">
        <div className="font-mono text-[0.7rem] tracking-wider uppercase opacity-80">12-Lead ECG · 25 mm/s · 10 mm/mV</div>
        <div className="font-mono text-[0.7rem] opacity-80">HR {hr} bpm</div>
      </div>
      <canvas ref={ref} className="w-full h-[320px] md:h-[380px] block" />
    </div>
  );
}
