// Production-grade camera capture for Live Capture.
// - Photo mode (1–4 stills) or Video mode (≤ N seconds)
// - User-gesture-bound start (fixes iOS / mobile silent failures)
// - Front/back switching with device enumeration + facingMode fallback
// - On video stop, also extracts up to 4 evenly-spaced JPEG frames so that
//   the vision model receives still images (vision models cannot consume webm)
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Camera,
  CircleDot,
  Square,
  RefreshCcw,
  ImagePlus,
  Trash2,
  Check,
  Video as VideoIcon,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type CaptureMode = "photo" | "video";

export interface CapturedPhoto {
  blob: Blob;
  previewUrl: string;
}

export interface VideoCaptureResult {
  kind: "video";
  videoBlob: Blob;
  /** Up to 4 evenly-spaced JPEG frames extracted from the video for vision AI. */
  frameBlobs: Blob[];
  durationSec: number;
}

export interface PhotoCaptureResult {
  kind: "photos";
  photoBlobs: Blob[];
}

export type CaptureResult = VideoCaptureResult | PhotoCaptureResult;

interface CameraCaptureProps {
  initialFacing: "user" | "environment";
  defaultMode: CaptureMode;
  /** Whether the doctor can switch between photo and video modes. */
  allowModeToggle?: boolean;
  maxSeconds: number;
  maxPhotos?: number;
  onComplete: (result: CaptureResult) => void;
  onError: (message: string) => void;
}

const FRAMES_FROM_VIDEO = 4;

export function CameraCapture({
  initialFacing,
  defaultMode,
  allowModeToggle = true,
  maxSeconds,
  maxPhotos = 4,
  onComplete,
  onError,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordedMimeRef = useRef<string>("video/webm");
  const [permission, setPermission] = useState<"idle" | "asking" | "granted" | "denied">("idle");
  const [mode, setMode] = useState<CaptureMode>(defaultMode);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [currentFacing, setCurrentFacing] = useState<"user" | "environment">(initialFacing);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [busy, setBusy] = useState(false);

  // ── Stream lifecycle ─────────────────────────────────────────────
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startStream = useCallback(
    async (facing: "user" | "environment") => {
      setPermission("asking");
      try {
        // Try ideal facing first; if it fails (some laptops only have one cam), fallback to any.
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: true,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // play() must be awaited; muted+playsInline allows autoplay on iOS
          await videoRef.current.play().catch(() => {});
        }
        setPermission("granted");
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message.includes("Permission")
              ? "Camera & microphone permission denied. Allow access in your browser settings."
              : e.message
            : "Camera permission denied";
        setPermission("denied");
        onError(msg);
      }
    },
    [onError],
  );

  // Cleanup on unmount only
  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  // ── Recording timer ──────────────────────────────────────────────
  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => {
      setElapsed((e) => {
        const next = e + 0.1;
        if (next >= maxSeconds) {
          stopRecording();
          return maxSeconds;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, maxSeconds]);

  // ── Actions ──────────────────────────────────────────────────────
  async function handleEnableCamera() {
    // Called from a user gesture — required by Safari / iOS.
    await startStream(currentFacing);
  }

  async function flipCamera() {
    if (isRecording) return;
    const next: "user" | "environment" = currentFacing === "user" ? "environment" : "user";
    stopStream();
    setCurrentFacing(next);
    await startStream(next);
  }

  function pickRecorderMime(): string {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4", // Safari iOS 14.3+
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
    }
    return "video/webm";
  }

  function startRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    setElapsed(0);
    const mime = pickRecorderMime();
    recordedMimeRef.current = mime;
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(streamRef.current, {
        mimeType: mime,
        videoBitsPerSecond: 2_500_000,
      });
    } catch {
      // Some browsers reject options — retry with defaults.
      rec = new MediaRecorder(streamRef.current);
    }
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      try {
        setBusy(true);
        const videoBlob = new Blob(chunksRef.current, { type: recordedMimeRef.current });
        const frameBlobs = await extractFrames(videoBlob, FRAMES_FROM_VIDEO).catch(() => []);
        onComplete({
          kind: "video",
          videoBlob,
          frameBlobs,
          durationSec: elapsed,
        });
      } finally {
        setBusy(false);
      }
    };
    rec.start(250);
    recorderRef.current = rec;
    setIsRecording(true);
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    setIsRecording(false);
  }

  async function takePhoto() {
    if (!videoRef.current || !streamRef.current) return;
    if (photos.length >= maxPhotos) return;
    const v = videoRef.current;
    const w = v.videoWidth || 1280;
    const h = v.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Front camera is mirrored in the preview (CSS); save un-mirrored for AI.
    ctx.drawImage(v, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.9),
    );
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setPhotos((p) => [...p, { blob, previewUrl: url }]);
  }

  function removePhoto(idx: number) {
    setPhotos((p) => {
      const next = [...p];
      const [removed] = next.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  function submitPhotos() {
    if (photos.length === 0) return;
    setBusy(true);
    try {
      onComplete({ kind: "photos", photoBlobs: photos.map((p) => p.blob) });
    } finally {
      setBusy(false);
    }
  }

  const pct = Math.min(100, (elapsed / maxSeconds) * 100);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      {allowModeToggle && permission !== "denied" && (
        <div className="flex justify-center">
          <div className="inline-flex rounded-full border border-border bg-card p-1 text-xs font-medium shadow-sm">
            <button
              type="button"
              onClick={() => !isRecording && setMode("photo")}
              className={cn(
                "rounded-full px-4 py-1.5 transition flex items-center gap-1.5 focus-ring",
                mode === "photo" ? "bg-tier-hybrid text-white" : "text-muted-foreground",
              )}
            >
              <ImageIcon className="h-3.5 w-3.5" /> Photo · up to {maxPhotos}
            </button>
            <button
              type="button"
              onClick={() => !isRecording && setMode("video")}
              className={cn(
                "rounded-full px-4 py-1.5 transition flex items-center gap-1.5 focus-ring",
                mode === "video" ? "bg-tier-hybrid text-white" : "text-muted-foreground",
              )}
            >
              <VideoIcon className="h-3.5 w-3.5" /> Video · ≤{maxSeconds}s
            </button>
          </div>
        </div>
      )}

      <div className="relative aspect-[9/16] sm:aspect-video w-full max-w-2xl mx-auto rounded-2xl overflow-hidden bg-black shadow-clinical">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "w-full h-full object-cover",
            currentFacing === "user" && "scale-x-[-1]",
          )}
        />

        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-black/60" />

        {/* Permission gate */}
        {permission !== "granted" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 gap-3 bg-black/85 px-6 text-center">
            <Camera className="h-10 w-10" strokeWidth={1.5} />
            {permission === "denied" ? (
              <>
                <div className="font-display text-lg">Camera access blocked</div>
                <p className="text-sm text-white/60 max-w-sm">
                  Allow camera & microphone in your browser, then reload this page.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 bg-white/10 border-white/20 text-white hover:bg-white/20"
                  onClick={() => startStream(currentFacing)}
                >
                  Try again
                </Button>
              </>
            ) : permission === "asking" ? (
              <>
                <div className="font-display text-lg flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Requesting camera…
                </div>
                <p className="text-sm text-white/60">
                  Please grant camera & microphone access to continue.
                </p>
              </>
            ) : (
              <>
                <div className="font-display text-lg">Camera ready</div>
                <p className="text-sm text-white/60 max-w-sm">
                  Tap to start the camera. Your video stays on your device until you submit.
                </p>
                <Button
                  size="lg"
                  onClick={handleEnableCamera}
                  className="mt-2 bg-tier-hybrid hover:bg-tier-hybrid/90 text-white"
                >
                  <Camera className="h-4 w-4 mr-2" /> Enable camera
                </Button>
              </>
            )}
          </div>
        )}

        {/* Top bar — mode chip + flip */}
        {permission === "granted" && (
          <div className="absolute top-3 inset-x-3 flex items-center justify-between">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.7rem] font-medium",
                isRecording
                  ? "bg-destructive text-destructive-foreground animate-pulse-soft"
                  : "bg-black/60 text-white/85",
              )}
            >
              <CircleDot className="h-3 w-3" />
              {mode === "video"
                ? `${isRecording ? "REC" : "READY"} · ${elapsed.toFixed(1)}s / ${maxSeconds}s`
                : `Photo ${photos.length}/${maxPhotos}`}
            </div>
            <button
              onClick={flipCamera}
              disabled={isRecording}
              className="rounded-full bg-black/60 text-white/90 p-2 hover:bg-black/80 transition focus-ring disabled:opacity-40"
              aria-label="Switch camera"
              title="Switch camera"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Photo strip */}
        {permission === "granted" && mode === "photo" && photos.length > 0 && (
          <div className="absolute top-14 inset-x-3 flex gap-2 overflow-x-auto pb-1">
            {photos.map((p, i) => (
              <div
                key={i}
                className="relative h-14 w-14 rounded-md overflow-hidden border border-white/30 shrink-0 bg-black/40"
              >
                <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-0.5 right-0.5 bg-black/70 rounded-full p-0.5 text-white/90"
                  aria-label="Remove photo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Bottom controls */}
        {permission === "granted" && (
          <div className="absolute bottom-6 inset-x-0 flex items-center justify-center gap-6">
            {mode === "video" ? (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={busy}
                aria-label={isRecording ? "Stop recording" : "Start recording"}
                className="relative h-20 w-20 focus-ring rounded-full disabled:opacity-50"
              >
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="36" fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="4" />
                  <circle
                    cx="40" cy="40" r="36" fill="none"
                    stroke="hsl(var(--tier-hybrid))"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 36}
                    strokeDashoffset={2 * Math.PI * 36 * (1 - pct / 100)}
                    style={{ transition: "stroke-dashoffset 100ms linear" }}
                  />
                </svg>
                <span
                  className={cn(
                    "absolute inset-2 rounded-full flex items-center justify-center transition",
                    isRecording ? "bg-destructive" : "bg-white",
                  )}
                >
                  {isRecording ? (
                    <Square className="h-6 w-6 text-white" fill="currentColor" />
                  ) : (
                    <span className="h-12 w-12 rounded-full bg-destructive" />
                  )}
                </span>
              </button>
            ) : (
              <>
                <button
                  onClick={takePhoto}
                  disabled={photos.length >= maxPhotos || busy}
                  aria-label="Take photo"
                  className="relative h-20 w-20 focus-ring rounded-full disabled:opacity-40"
                >
                  <span className="absolute inset-0 rounded-full border-4 border-white/80" />
                  <span className="absolute inset-2 rounded-full bg-white flex items-center justify-center">
                    <ImagePlus className="h-7 w-7 text-tier-hybrid" />
                  </span>
                </button>
                {photos.length > 0 && (
                  <Button
                    onClick={submitPhotos}
                    disabled={busy}
                    size="lg"
                    className="bg-tier-hybrid hover:bg-tier-hybrid/90 text-white"
                  >
                    {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                    Use {photos.length} photo{photos.length === 1 ? "" : "s"}
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {permission === "granted" && !isRecording && mode === "video" && (
          <div className="absolute bottom-28 inset-x-0 text-center text-white/70 text-xs px-6">
            Tap the shutter to record up to {maxSeconds}s. Hold the camera steady.
          </div>
        )}
        {permission === "granted" && mode === "photo" && photos.length === 0 && (
          <div className="absolute bottom-28 inset-x-0 text-center text-white/70 text-xs px-6">
            Capture up to {maxPhotos} clear photos. Steady the device & ensure good lighting.
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Frame extraction ─────────────────────────
/**
 * Extract `count` evenly-spaced JPEG frames from a recorded video Blob.
 * Runs entirely on-device. Returns [] silently if decoding fails.
 */
async function extractFrames(videoBlob: Blob, count: number): Promise<Blob[]> {
  if (count <= 0) return [];
  const url = URL.createObjectURL(videoBlob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  video.crossOrigin = "anonymous";
  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => resolve();
      const onErr = () => reject(new Error("decode_failed"));
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      video.addEventListener("error", onErr, { once: true });
      // Some browsers need a small play tick to populate dimensions
      video.load();
    });

    // Some browsers report duration=Infinity for webm — seek hack.
    let duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      duration = await new Promise<number>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve(video.duration && Number.isFinite(video.duration) ? video.duration : 1);
        };
        video.addEventListener("seeked", onSeeked);
        try {
          video.currentTime = 1e9;
        } catch {
          resolve(1);
        }
      }).catch(() => 1);
      // Reset
      try { video.currentTime = 0; } catch { /* noop */ }
    }
    if (!Number.isFinite(duration) || duration <= 0) duration = 1;

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];

    const frames: Blob[] = [];
    // Sample at 12%, 37%, 62%, 87% (evenly spaced, avoiding endpoints).
    const stops = Array.from({ length: count }, (_, i) => duration * ((i + 0.5) / count));
    for (const t of stops) {
      try {
        await seekTo(video, t);
        ctx.drawImage(video, 0, 0, w, h);
        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob((b) => res(b), "image/jpeg", 0.85),
        );
        if (blob) frames.push(blob);
      } catch {
        // Skip a single bad frame; keep going.
      }
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      reject(new Error("seek_failed"));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onErr, { once: true });
    try {
      video.currentTime = Math.max(0, Math.min(time, (video.duration || time) - 0.05));
    } catch {
      onErr();
    }
  });
}
