import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import imageCompression from "browser-image-compression";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { TierBadge } from "@/components/tier/TierBadge";
import { ResearchAssistedBanner } from "@/components/tier/ResearchAssistedBanner";
import { ModalityCatalog } from "@/components/study/ModalityCatalog";
import { DicomViewer } from "@/components/viewers/DicomViewer";
import { MODALITIES, findModality } from "@/lib/modalities";
import { buildQuestionnaire } from "@/lib/questionnaire";
import { detectMultiModalities, consumeMultiModalityQuota } from "@/lib/multiModalityApi";
import { useStudies } from "@/lib/store";
import {
  uploadStudy,
  startAnalysis as startAnalysisRemote,
  fetchStudy,
  subscribeStudyProgress,
  detectModality,
  type DynamicQuestion,
} from "@/lib/studyApi";
import {
  trackUploadStarted,
  trackUploadCompleted,
  trackQuestionnaireCompleted,
} from "@/lib/analytics";
import type { Modality, PreviewAsset, Question } from "@/lib/types";
import {
  Upload,
  Camera,
  X,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Stage = "select" | "upload" | "confirm" | "questionnaire" | "analyzing" | "zeroTouch";

const MAX_IMAGES = 10;
const MAX_VIDEOS = 3;
const MAX_VIDEO_SECONDS = 10;

const NewStudy = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialAdvanced = params.get("advanced") === "1";

  const [stage, setStage] = useState<Stage>(initialAdvanced ? "select" : "upload");
  const [advancedMode, setAdvancedMode] = useState(initialAdvanced);
  const [pickedModality, setPickedModality] = useState<Modality | null>(null);
  const [uploadedStudyId, setUploadedStudyId] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [dynamicQuestions, setDynamicQuestions] = useState<DynamicQuestion[] | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [qIndex, setQIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const commitDraft = useStudies((s) => s.commitDraft);
  const setReport = useStudies((s) => s.setReport);
  const upsertStudy = useStudies((s) => s.upsertStudy);
  const patchStudyStatus = useStudies((s) => s.patchStudyStatus);
  const [progressStage, setProgressStage] = useState<string>("queued");
  const [progressStatus, setProgressStatus] = useState<string>("Initializing...");

  // Zero-Touch Auto-Grouping draft state
  const [draftGroups, setDraftGroups] = useState<Array<{
    modality: Modality;
    files: File[];
    confidence: number;
    reasoning: string;
    answers: Record<string, unknown>;
  }>>([]);
  const [detectingGroups, setDetectingGroups] = useState(false);
  const [analyzingAll, setAnalyzingAll] = useState(false);

  // ─── File handling ─────────────────────────────────────────────
  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const fileArr = Array.from(files);

    // Block DICOM / NIfTI files — direct CT/MRI scanner exports are not supported.
    const unsupported = fileArr.filter((f) => {
      const n = f.name.toLowerCase();
      return (
        n.endsWith(".dcm") ||
        n.endsWith(".nii") ||
        n.endsWith(".nii.gz") ||
        f.type === "application/dicom"
      );
    });
    if (unsupported.length > 0) {
      toast.error(
        "DICOM/NIfTI files are not supported. Please upload JPG, PNG, or MP4 exported from your viewer.",
      );
      return;
    }

    const newImages = fileArr.filter((f) => f.type.startsWith("image/"));
    const newVideos = fileArr.filter((f) => f.type.startsWith("video/"));

    if (images.length + newImages.length > MAX_IMAGES) {
      toast.error(`Max ${MAX_IMAGES} images per study.`);
      return;
    }
    if (videos.length + newVideos.length > MAX_VIDEOS) {
      toast.error(`Max ${MAX_VIDEOS} videos per study.`);
      return;
    }

    // Validate video duration
    for (const v of newVideos) {
      const dur = await getVideoDuration(v);
      if (dur > MAX_VIDEO_SECONDS) {
        toast.error(`Videos must be ≤ ${MAX_VIDEO_SECONDS}s. "${v.name}" is ${dur.toFixed(1)}s.`);
        return;
      }
    }

    // Compress images
    setCompressing(true);
    setProgress(5);
    const compressed: File[] = [];
    const newPreviews: string[] = [];
    for (let i = 0; i < newImages.length; i++) {
      try {
        const out = await imageCompression(newImages[i], {
          maxSizeMB: 1.5,
          maxWidthOrHeight: 2400,
          useWebWorker: true,
          onProgress: (p) => setProgress(((i + p / 100) / newImages.length) * 100),
        });
        compressed.push(out);
        newPreviews.push(URL.createObjectURL(out));
      } catch {
        compressed.push(newImages[i]);
        newPreviews.push(URL.createObjectURL(newImages[i]));
      }
    }

    setImages((prev) => [...prev, ...compressed]);
    setPreviews((prev) => [...prev, ...newPreviews]);
    setVideos((prev) => [...prev, ...newVideos]);
    setProgress(100);
    setTimeout(() => {
      setCompressing(false);
      setProgress(0);
    }, 350);

    // Real detection happens in `goConfirm` after files are uploaded once.
  };

  const removeImage = (i: number) => {
    setImages((p) => p.filter((_, idx) => idx !== i));
    setPreviews((p) => p.filter((_, idx) => idx !== i));
  };

  const removeVideo = (i: number) => setVideos((p) => p.filter((_, idx) => idx !== i));

  // ─── Stage transitions ─────────────────────────────────────────
  const goConfirm = async () => {
    if (images.length === 0 && videos.length === 0) {
      toast.error("Please upload at least one image or video.");
      return;
    }

    setDetectingGroups(true);
    setStage("zeroTouch");
    try {
      const result = await detectMultiModalities(images);
      
      const mapped = result.groups.map(g => {
        const mod = findModality(g.modalitySlug) || MODALITIES[0];
        const groupFiles = g.fileIndexes.map(idx => images[idx]).filter(Boolean);
        return {
          modality: mod,
          files: groupFiles,
          confidence: g.confidence,
          reasoning: g.reasoning,
          answers: {},
        };
      });
      setDraftGroups(mapped);
    } catch (err) {
      console.warn("Zero-Touch auto-grouping failed, using fallback:", err);
      // Fallback: create a single draft card
      const mod = pickedModality ?? MODALITIES[0];
      setDraftGroups([{
        modality: mod,
        files: images,
        confidence: 1.0,
        reasoning: "Manual fallback.",
        answers: {},
      }]);
    } finally {
      setDetectingGroups(false);
    }
  };

  const handleApproveAndAnalyzeAll = async () => {
    setAnalyzingAll(true);
    try {
      const quota = await consumeMultiModalityQuota();
      if (!quota.allowed) {
        toast.error(quota.reason ?? "Quota denied.");
        return;
      }

      toast.info("Uploading draft studies and triggering parallel analysis...");

      // Process each group in parallel
      const analysisPromises = draftGroups.map(async (group) => {
        // 1. Upload files
        const uploaded = await uploadStudy({
          modality: group.modality,
          images: group.files,
          videos: [],
        });

        // 2. Trigger analysis with in-line questionnaire answers
        await startAnalysisRemote({
          studyId: uploaded.studyId,
          modalitySlug: group.modality.slug,
          questionnaireAnswers: group.answers,
        });
      });

      await Promise.all(analysisPromises);
      toast.success("All draft studies approved and clinical analysis triggered!");
      navigate("/app/studio"); // redirect straight to worklist
    } catch (err) {
      console.error("Bulk approval failed:", err);
      toast.error(err instanceof Error ? err.message : "Bulk analysis failed.");
    } finally {
      setAnalyzingAll(false);
    }
  };

  const goQuestionnaire = () => {
    setStage("questionnaire");
    setQIndex(0);
  };

  const startAnalysis = async () => {
    if (!pickedModality) return;
    setStage("analyzing");
    setProgress(0);
    setProgressStage("uploading");

    let serverStudyId: string | null = uploadedStudyId;
    try {
      // 1) Reuse upload from goConfirm (auto-detect path) or upload now (advanced path).
      let uploaded: { studyId: string };
      if (uploadedStudyId) {
        uploaded = { studyId: uploadedStudyId };
      } else {
        trackUploadStarted(pickedModality.slug, images.length + videos.length);
        const result = await uploadStudy({
          modality: pickedModality,
          images,
          videos,
        });
        uploaded = { studyId: result.studyId };
        setUploadedStudyId(result.studyId);
        trackUploadCompleted(pickedModality.slug, result.studyId);
      }
      serverStudyId = uploaded.studyId;
      trackQuestionnaireCompleted(pickedModality.slug, serverStudyId ?? undefined);

      // 2) Seed local cache so worklist + viewer can render immediately
      const previewAssets: PreviewAsset[] = [
        ...previews.map((src, i) => ({ kind: "image" as const, src, name: images[i]?.name })),
        ...videos.map((v) => ({ kind: "video" as const, src: URL.createObjectURL(v), name: v.name })),
      ];
      commitDraft({
        id: uploaded.studyId,
        modality: pickedModality,
        createdAt: new Date().toISOString(),
        status: "analyzing",
        imagesCount: images.length,
        videosCount: videos.length,
        previewAssets,
      });

      // 3) Subscribe to Realtime progress before kicking off analysis
      const unsub = subscribeStudyProgress(uploaded.studyId, async (row) => {
        const pct = Number(row.progress?.percent ?? 0);
        if (!Number.isNaN(pct)) setProgress(pct);
        if (row.progress?.stage) setProgressStage(row.progress.stage);
        if (row.progress?.status) setProgressStatus(row.progress.status);
        patchStudyStatus(uploaded.studyId, {
          status: row.status,
          errorMessage: row.error_message,
        });
        if (row.status === "awaiting_review" || row.status === "delivered") {
          unsub();
          // Pull the full report and merge into local cache
          try {
            const fetched = await fetchStudy(uploaded.studyId);
            if (fetched?.study) {
              upsertStudy({
                ...fetched.study,
                previewAssets,
              } as never);
            }
          } catch (err) {
            console.warn("get-study failed; will retry on study page", err);
          }
          navigate(`/app/study/${uploaded.studyId}`);
        } else if (row.status === "error") {
          unsub();
          toast.error(row.error_message ?? "Analysis failed.");
          setStage("questionnaire");
        }
      });

      // 4) Kick off background analysis
      await startAnalysisRemote({
        studyId: uploaded.studyId,
        modalitySlug: pickedModality.slug,
        questionnaireAnswers: answers,
      });

      // 5) Safety: if Realtime never delivers (e.g. lost connection), poll.
      //    Each tick aborts the previous in-flight request to prevent the
      //    edge function from being spammed with overlapping calls.
      const pollStarted = Date.now();
      let activePollController: AbortController | null = null;
      const poll = window.setInterval(async () => {
        if (Date.now() - pollStarted > 6 * 60 * 1000) {
          window.clearInterval(poll);
          activePollController?.abort();
          return;
        }
        if (activePollController) activePollController.abort();
        activePollController = new AbortController();
        const signal = activePollController.signal;
        try {
          const fetched = await fetchStudy(uploaded.studyId, { signal });
          if (!fetched) return;
          if (fetched.status === "awaiting_review" || fetched.status === "delivered") {
            window.clearInterval(poll);
            unsub();
            upsertStudy({ ...fetched.study, previewAssets } as never);
            navigate(`/app/study/${uploaded.studyId}`);
          } else if (fetched.status === "error") {
            window.clearInterval(poll);
            unsub();
            toast.error(fetched.errorMessage ?? "Analysis failed.");
            setStage("questionnaire");
          }
        } catch (err) {
          // Aborted requests are expected when a new tick fires — ignore.
          if ((err as { name?: string })?.name === "AbortError") return;
          /* ignore other transient errors */
        }
      }, 5000);
    } catch (err) {
      console.error("Analysis pipeline failed", err);
      const message = err instanceof Error ? err.message : "Could not start analysis.";
      toast.error(message);
      // Production: surface the failure and let the doctor retry. No mock data.
      setStage("questionnaire");
    }
  };

  // Prefer AI-generated dynamic questions; fall back to static template.
  const questionnaire: Question[] = dynamicQuestions && dynamicQuestions.length > 0
    ? dynamicQuestions as Question[]
    : pickedModality ? buildQuestionnaire(pickedModality) : [];
  const currentQ = questionnaire[qIndex];

  return (
    <AppShell>
      <Stepper stage={stage} />

      <AnimatePresence mode="wait">
        {/* ====== UPLOAD (default — auto-detect) ====== */}
        {stage === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-6 max-w-3xl mx-auto"
          >
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">
              Drop a study — we&rsquo;ll detect the modality.
            </h1>
            <p className="mt-2 text-muted-foreground">
              Up to {MAX_IMAGES} images and {MAX_VIDEOS} videos (≤{MAX_VIDEO_SECONDS}s each). Files
              are compressed locally before upload.
            </p>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(e.dataTransfer.files);
              }}
              className="mt-6 surface-clinical p-6 md:p-10 text-center border-2 border-dashed border-border hover:border-primary/40 transition cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-clinical text-primary-foreground flex items-center justify-center mb-4">
                <Upload className="h-6 w-6" />
              </div>
              <div className="font-display text-xl tracking-tight">
                Drag &amp; drop or click to upload
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                JPG, PNG, MP4, MOV — exports from your clinic camera or imaging viewer.
              </p>
              <div className="mt-5 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    cameraRef.current?.click();
                  }}
                >
                  <Camera className="h-4 w-4 mr-1.5" /> Use camera
                </Button>
              </div>

              {compressing && (
                <div className="mt-5 max-w-xs mx-auto">
                  <Progress value={progress} className="h-1.5" />
                  <p className="mt-2 text-xs text-muted-foreground">Compressing locally — {Math.round(progress)}%</p>
                </div>
              )}
            </div>

            {/* Live preview — DICOM-style viewer */}
            {previews.length > 0 && (
              <div className="mt-5 space-y-3">
                <DicomViewer sources={previews} caption="Local preview · pre-upload" />
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {previews.map((src, i) => (
                    <div key={i} className="relative group rounded-md overflow-hidden border border-border aspect-square bg-muted">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/90 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        aria-label="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {videos.length > 0 && (
              <div className="mt-3 space-y-2">
                {videos.map((v, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-surface-raised p-2.5">
                    <span className="text-sm truncate">🎥 {v.name}</span>
                    <button onClick={() => removeVideo(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                onClick={() => {
                  if (detecting) return;
                  setAdvancedMode(true);
                  setStage("select");
                }}
                disabled={detecting}
                className="text-sm text-muted-foreground hover:text-primary underline-offset-2 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline"
              >
                Advanced — pick the modality manually
              </button>
              <Button
                onClick={goConfirm}
                disabled={(images.length === 0 && videos.length === 0) || detecting}
                className="bg-primary hover:bg-primary/90 min-w-[180px]"
                size="lg"
                aria-busy={detecting}
              >
                {detecting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Detecting modality…</>
                ) : (
                  <>Continue <ArrowRight className="h-4 w-4 ml-1.5" /></>
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ====== DETECTION OVERLAY ====== */}
        <DetectionOverlay open={detecting} />

        {/* ====== ZERO-TOUCH DRAFT BOARD ====== */}
        {stage === "zeroTouch" && (
          <motion.div
            key="zeroTouch"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-6 max-w-4xl mx-auto space-y-6 animate-fade-in"
          >
            <div className="text-center sm:text-left">
              <h1 className="font-display text-3xl md:text-4xl tracking-tight flex items-center justify-center sm:justify-start gap-2.5">
                <Sparkles className="h-7 w-7 text-primary animate-pulse" /> Zero-Touch Auto-Grouping
              </h1>
              <p className="mt-2 text-muted-foreground">
                Kimi Clinical Swarm has clustered your {images.length} files into separate study drafts. Confirm and trigger parallel analysis.
              </p>
            </div>

            {detectingGroups ? (
              <div className="surface-clinical p-12 text-center flex flex-col items-center justify-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <div className="font-display text-xl tracking-tight">Kimi is clustering files...</div>
                <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                  Analyzing pixels, metadata and scanner layouts to construct independent drafted studies.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {draftGroups.map((group, idx) => {
                    const previewSrcs = group.files.map(f => URL.createObjectURL(f));
                    return (
                      <div key={idx} className="surface-clinical border border-border/80 flex flex-col overflow-hidden hover:shadow-lg transition-shadow duration-300 rounded-xl bg-surface-raised">
                        <div className={cn("h-1.5", group.modality.catalog === "nvidia_backed" ? "tier-stripe-nvidia" : "tier-stripe-research")} />
                        <div className="p-5 flex-1 flex flex-col space-y-4">
                          {/* Card Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Draft Study #{idx + 1}</div>
                              <h2 className="font-display text-lg tracking-tight font-semibold mt-0.5 text-foreground/95">
                                {group.modality.label}
                              </h2>
                            </div>
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded border bg-surface text-muted-foreground shrink-0">{group.files.length} files</span>
                          </div>

                          {/* Image stack preview */}
                          <div className="rounded-lg overflow-hidden border border-border/40 aspect-[2.4/1] bg-muted/20 relative group">
                            <img src={previewSrcs[0]} alt="" className="w-full h-full object-cover" />
                            {previewSrcs.length > 1 && (
                              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent flex items-end p-2.5">
                                <span className="text-[10px] font-mono font-medium text-foreground/90 bg-background/80 backdrop-blur px-2 py-0.5 rounded">+{previewSrcs.length - 1} more frames</span>
                              </div>
                            )}
                          </div>

                          {/* Override dropdown selector */}
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Change Modality</label>
                            <select
                              value={group.modality.slug}
                              onChange={(e) => {
                                const found = findModality(e.target.value);
                                if (found) {
                                  setDraftGroups(prev => prev.map((g, i) => i === idx ? { ...g, modality: found } : g));
                                }
                              }}
                              className="w-full text-xs p-2 rounded border border-border bg-surface text-foreground focus-ring font-normal"
                            >
                              {MODALITIES.map(m => (
                                <option key={m.slug} value={m.slug}>{m.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* Brief inline questions for quick confirmation */}
                          <div className="space-y-3.5 border-t border-border/50 pt-4 mt-auto">
                            <div className="text-[10px] uppercase tracking-wider text-primary font-mono flex items-center gap-1.5">
                              <Stethoscope className="h-3 w-3" /> Inline Patient Context
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground">Patient Age (yrs)</label>
                                <Input
                                  type="number"
                                  placeholder="e.g. 45"
                                  value={(group.answers.age as string) ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setDraftGroups(prev => prev.map((g, i) => i === idx ? { ...g, answers: { ...g.answers, age: val } } : g));
                                  }}
                                  className="h-8 text-xs bg-surface"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground">Clinical Indication</label>
                                <Input
                                  type="text"
                                  placeholder="e.g. chest pain"
                                  value={(group.answers.indication as string) ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setDraftGroups(prev => prev.map((g, i) => i === idx ? { ...g, answers: { ...g.answers, indication: val } } : g));
                                  }}
                                  className="h-8 text-xs bg-surface"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface-raised border border-border/60 rounded-xl p-4">
                  <Button variant="ghost" onClick={() => setStage("upload")}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Upload
                  </Button>
                  <Button
                    onClick={handleApproveAndAnalyzeAll}
                    disabled={analyzingAll}
                    size="lg"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[220px] font-semibold gap-1.5 shadow-lg shadow-primary/20"
                  >
                    {analyzingAll ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Analyzing all...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> Approve & Analyze All ({draftGroups.length})
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ====== SELECT (advanced) ====== */}
        {stage === "select" && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-6"
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h1 className="font-display text-3xl md:text-4xl tracking-tight">
                  Choose a modality
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Search the full catalog of 128 modalities across 9 categories.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdvancedMode(false);
                  setStage("upload");
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to auto-detect
              </Button>
            </div>
            <ModalityCatalog
              onPick={(m) => {
                setPickedModality(m);
                setStage("upload");
              }}
              selected={pickedModality?.slug}
            />
          </motion.div>
        )}

        {/* ====== CONFIRM ====== */}
        {stage === "confirm" && pickedModality && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-6 max-w-2xl mx-auto"
          >
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">
              Confirm before we analyze.
            </h1>
            <p className="mt-2 text-muted-foreground">
              {advancedMode
                ? "You picked this modality manually."
                : "Auto-detect identified this from your upload."}
            </p>

            <div className="mt-6 surface-clinical overflow-hidden">
              <div
                className={cn(
                  "h-1.5",
                  pickedModality.catalog === "nvidia_backed" ? "tier-stripe-nvidia" : "tier-stripe-research"
                )}
              />
              <div className="p-6 md:p-8">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {pickedModality.category}
                </div>
                <h2 className="font-display text-2xl md:text-3xl tracking-tight mt-1">
                  {pickedModality.label}
                </h2>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <TierBadge tier={pickedModality.tier} size="md" />
                  <span className="font-mono text-xs text-muted-foreground">{pickedModality.slug}</span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-surface p-3">
                    <div className="text-xs text-muted-foreground">Images</div>
                    <div className="font-display text-2xl">{images.length}</div>
                  </div>
                  <div className="rounded-lg bg-surface p-3">
                    <div className="text-xs text-muted-foreground">Videos</div>
                    <div className="font-display text-2xl">{videos.length}</div>
                  </div>
                </div>

                {pickedModality.tier === "C" && (
                  <div className="mt-5">
                    <ResearchAssistedBanner />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStage("upload")}>
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
              </Button>
              <Button onClick={goQuestionnaire} size="lg" className="bg-primary hover:bg-primary/90">
                Confirm &amp; continue <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* ====== QUESTIONNAIRE ====== */}
        {stage === "questionnaire" && currentQ && pickedModality && (
          <motion.div
            key={"q" + qIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="mt-6 max-w-2xl mx-auto"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
              <span className="font-mono">
                Question {qIndex + 1} of {questionnaire.length}
              </span>
              <TierBadge tier={pickedModality.tier} size="sm" />
            </div>
            <Progress value={((qIndex + 1) / questionnaire.length) * 100} className="h-1 mb-6" />

            <div className="surface-clinical p-6 md:p-8">
              <h2 className="font-display text-2xl md:text-3xl tracking-tight text-balance">
                {currentQ.prompt}
              </h2>
              {currentQ.helper && (
                <p className="mt-2 text-sm text-muted-foreground">{currentQ.helper}</p>
              )}

              <div className="mt-6">
                <QuestionInput
                  question={currentQ}
                  value={answers[currentQ.id]}
                  onChange={(v) => setAnswers((p) => ({ ...p, [currentQ.id]: v }))}
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => (qIndex === 0 ? setStage("confirm") : setQIndex(qIndex - 1))}
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
              </Button>
              <Button
                onClick={() => {
                  if (currentQ.required) {
                    const v = answers[currentQ.id];
                    const empty =
                      v === undefined ||
                      v === null ||
                      v === "" ||
                      (Array.isArray(v) && v.length === 0);
                    if (empty) {
                      toast.error("This question is required.");
                      return;
                    }
                  }
                  if (qIndex < questionnaire.length - 1) setQIndex(qIndex + 1);
                  else startAnalysis();
                }}
                size="lg"
                className="bg-primary hover:bg-primary/90"
              >
                {qIndex < questionnaire.length - 1 ? (
                  <>Next <ArrowRight className="h-4 w-4 ml-1.5" /></>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-1.5" /> Run analysis</>
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ====== ANALYZING ====== */}
        {stage === "analyzing" && pickedModality && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-10 max-w-md mx-auto text-center"
          >
            <div className="relative inline-flex items-center justify-center mb-6">
              <div className="absolute inset-0 bg-gradient-clinical rounded-full blur-2xl opacity-30 animate-breathe" />
              <div className="relative h-20 w-20 rounded-full bg-gradient-clinical text-primary-foreground flex items-center justify-center">
                <Sparkles className="h-8 w-8" />
              </div>
            </div>
            <h1 className="font-display text-3xl tracking-tight">
              Analyzing your study…
            </h1>
            <p className="mt-2 text-muted-foreground">
              AI-assisted analysis · clinician-reviewed before delivery.
            </p>
            <Progress value={progress} className="mt-7 h-1.5" />
            <div className="mt-3 flex items-center justify-between text-xs font-mono text-muted-foreground">
              <div>{Math.round(progress)}%</div>
              <div className="text-primary font-medium animate-pulse">{progressStatus}</div>
            </div>

            <div className="mt-8 space-y-3.5 text-left">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-4">
                Clinical Agent Swarm Pipeline
              </div>
              {[
                {
                  id: "observation",
                  name: "Lead Clinical Observation Agent (Kimi K2.6)",
                  desc: "Examines image pixels, symptoms & history context to outline visual diagnostic findings.",
                  isActive: progressStage === "inference" && progress >= 50 && progress < 70,
                  isDone: progress >= 70,
                },
                {
                  id: "verification",
                  name: "Medical Guideline & Verification Agent (Kimi K2.6)",
                  desc: "Performs real-time search queries & cross-references observations against clinical guidelines.",
                  isActive: progressStage === "inference" && progress >= 70 && progress < 80,
                  isDone: progress >= 80,
                },
                {
                  id: "synthesis",
                  name: "Synthesis & Reporting Agent (Kimi K2.6)",
                  desc: "Deduplicates, scores, codes ICD-10 / SNOMED CT and serializes the report JSON.",
                  isActive: (progressStage === "inference" && progress >= 80 && progress < 90) || progressStage === "narrative",
                  isDone: progressStage === "complete" || progress >= 90,
                },
              ].map((agent, i) => {
                const done = agent.isDone;
                const active = agent.isActive;
                return (
                  <div key={agent.id} className={cn(
                    "p-4 rounded-xl border transition-all duration-300",
                    active
                      ? "border-primary bg-primary/5 shadow-md shadow-primary/5 scale-[1.01]"
                      : done
                        ? "border-border/60 bg-surface/50 opacity-80"
                        : "border-border/40 bg-transparent opacity-40"
                  )}>
                    <div className="flex items-start gap-3">
                      {done ? (
                        <CheckCircle2 className="h-5 w-5 text-tier-nvidia shrink-0 mt-0.5" />
                      ) : active ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0 mt-0.5" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border border-border shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className={cn("font-medium text-sm", active ? "text-foreground font-semibold" : "text-muted-foreground")}>
                          {agent.name}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {agent.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
};

// ────────── Question input renderer ──────────
function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (question.kind === "yesno") {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[
          { v: "yes", l: "Yes" },
          { v: "no", l: "No" },
          { v: "unsure", l: "Unsure" },
        ].map((opt) => (
          <button
            key={opt.v}
            onClick={() => onChange(opt.v)}
            className={cn(
              "h-12 rounded-lg border font-medium transition",
              value === opt.v
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:border-primary/40"
            )}
          >
            {opt.l}
          </button>
        ))}
      </div>
    );
  }
  if (question.kind === "multi") {
    // Multi-select: value is an array of selected option values.
    const selected: string[] = Array.isArray(value)
      ? (value as string[])
      : value
        ? [value as string]
        : [];
    const toggle = (v: string) => {
      const next = selected.includes(v)
        ? selected.filter((x) => x !== v)
        : [...selected, v];
      onChange(next);
    };
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {question.options?.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                aria-pressed={isSelected}
                className={cn(
                  "text-left p-3 rounded-lg border transition flex items-start gap-2.5",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:border-primary/40"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition",
                    isSelected
                      ? "bg-primary-foreground/20 border-primary-foreground"
                      : "border-muted-foreground/40"
                  )}
                  aria-hidden="true"
                >
                  {isSelected && <CheckCircle2 className="h-3 w-3" />}
                </span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Select all that apply.
        </p>
      </div>
    );
  }
  if (question.kind === "number") {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={question.min}
          max={question.max}
          value={(value as number) ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-12 text-lg bg-background w-32 font-mono"
        />
        <span className="text-muted-foreground">{question.unit}</span>
      </div>
    );
  }
  return (
    <Textarea
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type your answer…"
      className="min-h-[120px] bg-background"
      maxLength={1000}
    />
  );
}

// ────────── Stage stepper ──────────
function Stepper({ stage }: { stage: Stage }) {
  const steps: { key: Stage; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "confirm", label: "Confirm" },
    { key: "questionnaire", label: "Brief" },
    { key: "analyzing", label: "Analyze" },
  ];
  // 'select' visually maps to upload step
  const activeKey: Stage = stage === "select" ? "upload" : stage === "zeroTouch" ? "confirm" : stage;
  const idx = steps.findIndex((s) => s.key === activeKey);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-x-auto scrollbar-thin">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2 shrink-0">
          <div
            className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center font-mono text-[0.65rem] border",
              i < idx
                ? "bg-tier-nvidia text-white border-tier-nvidia"
                : i === idx
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border"
            )}
          >
            {i < idx ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span className={i === idx ? "text-foreground font-medium" : ""}>{s.label}</span>
          {i < steps.length - 1 && <ChevronRight className="h-3 w-3 opacity-50" />}
        </div>
      ))}
    </div>
  );
}

// ────────── Helpers ──────────
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration || 0);
    };
    v.onerror = () => resolve(0);
    v.src = url;
  });
}

// ────────── Detection Overlay ──────────
// Shown while we upload + run AI-vision modality detection.
// Cycles through human-readable beats so the doctor sees activity.
function DetectionOverlay({ open }: { open: boolean }) {
  const beats = [
    { label: "Securing & uploading study", icon: Upload },
    { label: "Contacting Manthana‑Labs vision agent", icon: Sparkles },
    { label: "Detecting modality & anatomy", icon: ShieldCheck },
    { label: "Drafting clinical questions", icon: Sparkles },
  ];
  const [active, setActive] = useState(0);
  const startedAt = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!open) { setActive(0); setElapsed(0); return; }
    startedAt.current = Date.now();
    const beatTimer = window.setInterval(() => {
      setActive((i) => Math.min(i + 1, beats.length - 1));
    }, 4500);
    const tick = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 250);
    return () => { window.clearInterval(beatTimer); window.clearInterval(tick); };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="alertdialog"
          aria-live="polite"
          aria-label="Detecting modality"
        >
          <motion.div
            initial={{ y: 20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="surface-clinical w-full max-w-md p-7 rounded-2xl border border-border shadow-2xl"
          >
            <div className="flex items-center justify-center mb-5">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-clinical rounded-full blur-2xl opacity-40 animate-breathe" />
                <div className="relative h-16 w-16 rounded-full bg-gradient-clinical text-primary-foreground flex items-center justify-center">
                  <Sparkles className="h-7 w-7" />
                </div>
              </div>
            </div>
            <h2 className="font-display text-xl tracking-tight text-center">
              Agent is thinking…
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground text-center">
              Identifying the right model for your study. Usually 20–60 seconds.
            </p>

            <div className="mt-6 space-y-2.5">
              {beats.map((b, i) => {
                const Icon = b.icon;
                const isDone = i < active;
                const isActive = i === active;
                return (
                  <motion.div
                    key={b.label}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition",
                      isActive
                        ? "border-primary/40 bg-primary/5"
                        : isDone
                        ? "border-border bg-background/40"
                        : "border-border/60 bg-background/20"
                    )}
                  >
                    <div className="shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-tier-nvidia" />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <Icon className="h-4 w-4 text-muted-foreground/60" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-sm",
                        isActive
                          ? "text-foreground font-medium"
                          : isDone
                          ? "text-foreground/80"
                          : "text-muted-foreground"
                      )}
                    >
                      {b.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono">{String(elapsed).padStart(2, "0")}s elapsed</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Working — please don&rsquo;t close this tab
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default NewStudy;
