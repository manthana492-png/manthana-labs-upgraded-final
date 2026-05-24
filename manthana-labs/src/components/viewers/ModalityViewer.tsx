import { lazy, Suspense } from "react";
import type { Modality, PreviewAsset } from "@/lib/types";
import { DicomViewer } from "./DicomViewer";
import { VideoViewer } from "./VideoViewer";
import { EcgViewer } from "./EcgViewer";
import { PathologyViewer } from "./PathologyViewer";

const CornerstoneViewer = lazy(() =>
  import("./CornerstoneViewer").then((m) => ({ default: m.CornerstoneViewer })),
);

/**
 * Picks the right viewer for a modality + assets combination.
 * - Video category → VideoViewer
 * - ECG → synthetic 12-lead viewer
 * - Pathology → deep-zoom DicomViewer
 * - X-Ray / CT / MRI / Ultrasound / Nuclear → Cornerstone3D (DICOM, ROI, MPR, cine)
 *   Tier B volumetric series automatically enable MPR.
 * - Photo / fallback → lightweight DicomViewer (canvas)
 */
export function ModalityViewer({
  modality,
  assets,
  heatmapSrc,
  className,
}: {
  modality: Modality;
  assets: PreviewAsset[];
  heatmapSrc?: string;
  className?: string;
}) {
  const images = assets.filter((a) => a.kind === "image").map((a) => a.src);
  const video = assets.find((a) => a.kind === "video")?.src;

  if (modality.category === "ECG") {
    return <EcgViewer className={className} />;
  }

  if (modality.category === "Video" && video) {
    return <VideoViewer src={video} caption={modality.label} className={className} />;
  }

  if (modality.category === "Pathology" && images.length) {
    return <PathologyViewer sources={images} className={className} />;
  }

  // Cornerstone3D for true medical imaging modalities — only when sources are
  // actual DICOM (`.dcm` or `wadouri:` URIs). Browser object URLs (`blob:`) and
  // plain JPEG/PNG previews are routed through the canvas DicomViewer below,
  // because Cornerstone's DICOM image loader has no `blob:` scheme handler and
  // would render a "No image loader found for scheme 'blob'" error.
  const csCategories: Modality["category"][] = ["X-Ray", "CT", "MRI", "Ultrasound", "Nuclear"];
  const isDicomSource = (src: string) => {
    const lower = src.toLowerCase();
    return lower.endsWith(".dcm") || lower.includes("dicom") || lower.startsWith("wadouri:");
  };
  const allDicom = images.length > 0 && images.every(isDicomSource);
  if (csCategories.includes(modality.category) && images.length && allDicom) {
    return (
      <Suspense fallback={<div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground">Loading DICOM viewer…</div>}>
        <CornerstoneViewer
          imageIds={toImageIds(images)}
          caption={modality.label}
          mpr={modality.tier === "B" && images.length >= 4}
          cine
          className={className}
        />
      </Suspense>
    );
  }

  if (images.length) {
    return (
      <DicomViewer
        sources={images}
        caption={modality.label}
        heatmapSrc={heatmapSrc}
        className={className}
      />
    );
  }

  if (video) {
    return <VideoViewer src={video} caption={modality.label} className={className} />;
  }

  return (
    <div className={"rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground " + (className ?? "")}>
      No preview assets available for this study.
    </div>
  );
}

function toImageIds(sources: string[]): string[] {
  return sources.map((src) => {
    const lower = src.toLowerCase();
    if (lower.endsWith(".dcm") || lower.includes("dicom")) {
      return src.startsWith("wadouri:") ? src : `wadouri:${src}`;
    }
    return src;
  });
}
