import { useEffect, useState } from "react";

const STORAGE_KEY = "ml_cookie_consent_v1";
const GA_ID = "G-EPYQSB5ZRG";

type Consent = "granted" | "denied" | null;

function readConsent(): Consent {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "granted" || v === "denied" ? v : null;
}

function loadGtag() {
  if (typeof window === "undefined") return;
  if (document.getElementById("ga4-script")) return;
  const s = document.createElement("script");
  s.id = "ga4-script";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

/** Apply consent to gtag's Consent Mode and (optionally) load the script. */
export function applyConsent(consent: Consent) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  const gtag = (...args: any[]) => window.dataLayer.push(args);
  if (!window.gtag) window.gtag = gtag as any;

  if (consent === "granted") {
    loadGtag();
    window.gtag("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "granted",
    });
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { send_page_view: false });
  } else if (consent === "denied") {
    window.gtag?.("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
  }
}

/** Open the banner again from anywhere (e.g. Privacy page footer). */
export function openCookieSettings() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("ml:cookie-consent-reset"));
}

export const CookieConsent = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const initial = readConsent();
    applyConsent(initial); // applies "denied" defaults if null/denied
    if (initial === null) setVisible(true);

    const onReset = () => setVisible(true);
    window.addEventListener("ml:cookie-consent-reset", onReset);
    return () => window.removeEventListener("ml:cookie-consent-reset", onReset);
  }, []);

  const choose = (c: Consent) => {
    if (c) localStorage.setItem(STORAGE_KEY, c);
    applyConsent(c);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-[100] sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-md rounded-2xl border border-border bg-background/95 backdrop-blur shadow-lg p-4 sm:p-5"
    >
      <p className="text-sm font-medium text-foreground">We use cookies</p>
      <p className="mt-1 text-xs text-muted-foreground">
        We load Google Analytics only if you accept. This helps us improve Manthana-Labs.
        Read our <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => choose("denied")}
          className="text-xs px-3 py-2 rounded-lg border border-border hover:bg-accent/50 focus-ring"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => choose("granted")}
          className="text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 focus-ring"
        >
          Accept
        </button>
      </div>
    </div>
  );
};

export default CookieConsent;
