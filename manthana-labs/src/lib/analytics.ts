// GA4 analytics helper
// Measurement ID is also injected via index.html (gtag.js).
export const GA_MEASUREMENT_ID = "G-EPYQSB5ZRG";

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

export function gaEvent(name: string, params: Record<string, any> = {}) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  try {
    window.gtag("event", name, params);
  } catch {
    // no-op
  }
}

export function gaPageView(path: string, title?: string) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_title: title ?? document.title,
    page_location: window.location.href,
  });
}

// Key events
export const trackUploadStarted = (modality?: string, fileCount?: number) =>
  gaEvent("upload_started", { modality, file_count: fileCount });

export const trackUploadCompleted = (modality?: string, studyId?: string) =>
  gaEvent("upload_completed", { modality, study_id: studyId });

export const trackQuestionnaireCompleted = (modality?: string, studyId?: string) =>
  gaEvent("questionnaire_completed", { modality, study_id: studyId });

export const trackPdfDownloaded = (studyId?: string, kind: string = "report") =>
  gaEvent("pdf_downloaded", { study_id: studyId, kind });

export const trackSignup = (method?: string) =>
  gaEvent("sign_up", { method: method ?? "email" });

export const trackLogin = (method?: string) =>
  gaEvent("login", { method: method ?? "email" });
