// Indian language catalog used for in-app translation.
// Order: most-spoken first; English always available.

export interface LanguageOption {
  code: string;          // BCP-47-ish
  label: string;         // English label
  native: string;        // Native script display
}

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "or", label: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "ur", label: "Urdu", native: "اردو" },
  { code: "as", label: "Assamese", native: "অসমীয়া" },
  { code: "sa", label: "Sanskrit", native: "संस्कृतम्" },
];

export const RTL_CODES = new Set(["ur", "ar"]);

export function isRtl(code: string) {
  return RTL_CODES.has(code);
}
