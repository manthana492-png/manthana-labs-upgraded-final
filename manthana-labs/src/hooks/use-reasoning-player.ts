/**
 * useReasoningPlayer — playback engine for the Reasoning Replay timeline.
 *
 * Drives:
 *   • current playhead time (t)
 *   • play/pause/scrub
 *   • playback speed
 *   • the active beat (derived)
 *
 * Pure state — no DOM. The visual choreography (ROI box pulse, heatmap
 * overlay opacity, citation lighting) is applied by consumers who read
 * `activeBeat` and tween via framer-motion.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findBeatAtTime, type ReasoningBeat, type ReasoningTrace } from "@/lib/reasoningBeats";

export interface UseReasoningPlayerResult {
  t: number;
  playing: boolean;
  speed: number;
  activeBeat: ReasoningBeat | undefined;
  activeIndex: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  jumpTo: (beat: ReasoningBeat) => void;
  next: () => void;
  prev: () => void;
  setSpeed: (s: number) => void;
  /** Restart from beginning. */
  restart: () => void;
  finished: boolean;
}

export function useReasoningPlayer(trace: ReasoningTrace, opts?: { autoplay?: boolean }): UseReasoningPlayerResult {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(!!opts?.autoplay);
  const [speed, setSpeed] = useState(1);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  // Stop at end
  useEffect(() => {
    if (t >= trace.totalSeconds && playing) setPlaying(false);
  }, [t, trace.totalSeconds, playing]);

  // RAF loop
  useEffect(() => {
    if (!playing) {
      lastFrameRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = (now: number) => {
      const last = lastFrameRef.current ?? now;
      const dt = (now - last) / 1000;
      lastFrameRef.current = now;
      setT((prev) => Math.min(trace.totalSeconds, prev + dt * speed));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, speed, trace.totalSeconds]);

  const activeBeat = useMemo(() => findBeatAtTime(trace.beats, t), [trace.beats, t]);
  const activeIndex = useMemo(
    () => (activeBeat ? trace.beats.findIndex((b) => b.id === activeBeat.id) : -1),
    [trace.beats, activeBeat],
  );

  const play = useCallback(() => {
    setPlaying((wasPlaying) => {
      // If finished and user hits play, restart from 0.
      if (!wasPlaying && t >= trace.totalSeconds - 0.01) {
        setT(0);
      }
      return true;
    });
  }, [t, trace.totalSeconds]);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, play, pause]);
  const seek = useCallback((next: number) => {
    setT(Math.max(0, Math.min(trace.totalSeconds, next)));
  }, [trace.totalSeconds]);
  const jumpTo = useCallback((beat: ReasoningBeat) => {
    setT(beat.t);
  }, []);
  const next = useCallback(() => {
    const idx = trace.beats.findIndex((b) => b.t > t + 0.01);
    if (idx >= 0) setT(trace.beats[idx].t);
  }, [trace.beats, t]);
  const prev = useCallback(() => {
    const before = [...trace.beats].reverse().find((b) => b.t < t - 0.01);
    if (before) setT(before.t);
    else setT(0);
  }, [trace.beats, t]);
  const restart = useCallback(() => {
    setT(0);
    setPlaying(true);
  }, []);

  const finished = t >= trace.totalSeconds - 0.01;

  return { t, playing, speed, activeBeat, activeIndex, play, pause, toggle, seek, jumpTo, next, prev, setSpeed, restart, finished };
}
