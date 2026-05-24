import { DicomViewer } from "./DicomViewer";

/**
 * Pathology / WSI deep-zoom viewer.
 * Reuses the DicomViewer canvas pipeline but allows much higher zoom and
 * shows a "WSI" caption. For real whole-slide images, swap the source for
 * a tiled DZI or IIIF endpoint (the canvas pipeline can host an OpenSeadragon
 * instance later).
 */
export function PathologyViewer({ sources, className }: { sources: string[]; className?: string }) {
  return (
    <DicomViewer
      sources={sources}
      caption="WSI · H&E"
      className={className}
    />
  );
}
