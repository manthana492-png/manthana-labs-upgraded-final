// Biometric login helper — uses WebAuthn platform authenticator (Face ID,
// Touch ID, Windows Hello, Android biometrics) to gate access to a stored
// Supabase refresh token. We don't actually verify the WebAuthn assertion on
// a server (no backend RP) — we just use it as a local "user presence + user
// verification" gate before reading the cached session.
//
// This is intentionally simple and *device-local*. The user can always fall
// back to email + password.

import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "manthana.biometric.v1";
const CRED_ID_KEY = "manthana.biometric.credId.v1";

interface StoredSession {
  email: string;
  refreshToken: string;
  enrolledAt: string;
}

export function isBiometricSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.PublicKeyCredential && navigator.credentials);
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isBiometricSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isBiometricEnrolled(): boolean {
  return !!localStorage.getItem(STORAGE_KEY) && !!localStorage.getItem(CRED_ID_KEY);
}

export function getEnrolledEmail(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.email ?? null;
  } catch {
    return null;
  }
}

function randomBytes(n = 32): ArrayBuffer {
  const arr = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(arr);
  return arr.buffer;
}

function strToBuf(s: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(s);
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

/** Enroll the current authenticated session as biometric login. */
export async function enrollBiometric(email: string): Promise<void> {
  if (!isBiometricSupported()) throw new Error("Biometric not supported on this device.");

  const { data: sessionData } = await supabase.auth.getSession();
  const refreshToken = sessionData.session?.refresh_token;
  if (!refreshToken) throw new Error("Please sign in first before enabling biometric login.");

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: "Manthana-Labs" },
      user: {
        id: strToBuf(email),
        name: email,
        displayName: email,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },   // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error("Biometric enrollment cancelled.");

  const stored: StoredSession = { email, refreshToken, enrolledAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  localStorage.setItem(CRED_ID_KEY, bufToB64(cred.rawId));
}

/** Prompt biometric and, on success, restore the cached Supabase session. */
export async function signInWithBiometric(): Promise<{ email: string }> {
  if (!isBiometricSupported()) throw new Error("Biometric not supported on this device.");
  const raw = localStorage.getItem(STORAGE_KEY);
  const credIdB64 = localStorage.getItem(CRED_ID_KEY);
  if (!raw || !credIdB64) throw new Error("No biometric login enrolled on this device.");

  const stored = JSON.parse(raw) as StoredSession;

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      timeout: 60000,
      userVerification: "required",
      allowCredentials: [{ id: b64ToBuf(credIdB64), type: "public-key" }],
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error("Biometric authentication cancelled.");

  // Restore Supabase session from cached refresh token.
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: stored.refreshToken });
  if (error || !data.session) {
    // Refresh token expired — clear local enrollment so the user re-signs in.
    disableBiometric();
    throw new Error("Biometric session expired — please sign in with your password again.");
  }

  // Update the stored refresh token (rotates).
  const updated: StoredSession = { ...stored, refreshToken: data.session.refresh_token };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

  return { email: stored.email };
}

export function disableBiometric(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(CRED_ID_KEY);
}
