# Migration Guide: Lovable Cloud → Your Own Supabase

**Audience:** an AI coding agent (Cursor, Claude Code, etc.) working on a downloaded copy of this repo outside Lovable.

**Goal:** strip every Lovable-managed dependency (Lovable Cloud, Lovable AI Gateway, Lovable Auth bridge) and rewire the app to a self-hosted Supabase project + a directly-called AI provider.

---

## 0. What "Lovable infra" actually means in this repo

There are 3 distinct pieces. Remove all 3.

| Piece | What it is | How it shows up in code |
|---|---|---|
| **Lovable Cloud** | A Supabase project provisioned & billed by Lovable | `.env` `VITE_SUPABASE_*` vars point to `eqqwfdublzolqrfwzszc.supabase.co`; `src/integrations/supabase/client.ts` (auto-generated); `src/integrations/supabase/types.ts` (auto-generated); all `supabase/migrations/*.sql`; all `supabase/functions/*` edge functions; `supabase/config.toml` |
| **Lovable AI Gateway** | Proxy at `https://ai.gateway.lovable.dev/v1` authed with `LOVABLE_API_KEY` | Used in `supabase/functions/_shared/aiCascade.ts` and any edge function that calls AI. Will return 401 outside Lovable. |
| **Lovable Auth bridge** | OAuth helper that wraps Supabase auth | `src/integrations/lovable/index.ts`, package `@lovable.dev/cloud-auth-js`, any `lovable.auth.signInWithOAuth(...)` call |

---

## 1. Stand up your own Supabase project (manual, user does this)

The user creates a new project at https://supabase.com/dashboard. They will give you:

- `SUPABASE_URL` (e.g. `https://abcdxyz.supabase.co`)
- `SUPABASE_ANON_KEY` (publishable)
- `SUPABASE_SERVICE_ROLE_KEY` (server only — never put in `VITE_*`)
- `SUPABASE_PROJECT_REF` (the `abcdxyz` part)
- `SUPABASE_DB_URL` (the Postgres connection string)

Do not proceed without these.

---

## 2. Replace the Lovable Cloud connection

### 2a. `.env` (project root)
Overwrite with:
```
VITE_SUPABASE_URL=https://<REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_SUPABASE_PROJECT_ID=<REF>
```
Add `.env` to `.gitignore` if not already there.

### 2b. `src/integrations/supabase/client.ts`
This file's header says "auto-generated, do not edit" — that rule was a **Lovable** rule. Outside Lovable, edit it freely. Current contents are fine; it just reads `import.meta.env.VITE_SUPABASE_*`, which now point at the user's project. No code change needed if `.env` is updated.

### 2c. `src/integrations/supabase/types.ts`
Regenerate against the new DB:
```bash
npx supabase login
npx supabase link --project-ref <REF>
npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

### 2d. `supabase/config.toml`
Change `project_id = "eqqwfdublzolqrfwzszc"` to the new ref.

---

## 3. Push the schema to the new Supabase

```bash
npx supabase link --project-ref <REF>
npx supabase db push
```
This runs every file in `supabase/migrations/` in order. If any migration references `LOVABLE_*` extensions or roles, edit the migration to remove the reference and re-run.

Then in the Supabase dashboard:
- **Storage → New bucket** → create `studies` (private) and `doctor-branding` (private).
- **Database → Extensions** → enable `pgmq` (required by email queue).
- **Database → Cron Jobs** → if the app needs scheduled jobs (e.g. `process-email-queue`), recreate them. Inspect `supabase/functions/process-email-queue/` for the cadence.

---

## 4. Rip out the Lovable Auth bridge

### 4a. Delete files
```
rm -rf src/integrations/lovable
```

### 4b. Remove the package
```bash
npm uninstall @lovable.dev/cloud-auth-js
# or: bun remove @lovable.dev/cloud-auth-js
```

### 4c. Replace every `lovable.auth.*` call
Search the repo:
```bash
rg -n "from ['\"]@/integrations/lovable" src
rg -n "lovable\.auth\." src
```
For each hit, replace:
```ts
// before
import { lovable } from "@/integrations/lovable";
await lovable.auth.signInWithOAuth("google", { redirect_uri });

// after
import { supabase } from "@/integrations/supabase/client";
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: redirect_uri },
});
```

### 4d. Configure Google OAuth in the new Supabase
Dashboard → Authentication → Providers → Google → enable, paste OAuth client ID + secret from Google Cloud Console. Add the production + localhost callback URLs to Google's authorized redirect URIs **and** to Supabase's "Site URL" + "Redirect URLs" allowlist.

---

## 5. Replace the Lovable AI Gateway

`LOVABLE_API_KEY` only works while running on Lovable. It must go.

### 5a. Audit usage
```bash
rg -n "LOVABLE_API_KEY|ai\.gateway\.lovable\.dev" supabase/functions
```
Primary hit is `supabase/functions/_shared/aiCascade.ts`. Other functions import from there.

### 5b. Pick a replacement provider
Recommended: **OpenRouter** (already used elsewhere in this project — secret `OPENROUTER_API_KEY` exists). It exposes an OpenAI-compatible `/v1/chat/completions` endpoint at `https://openrouter.ai/api/v1` and routes to most of the models the cascade expects (Gemini, GPT, etc.).

Alternative providers: OpenAI direct, Google AI Studio (Gemini), Anthropic. Each needs its own request shape.

### 5c. Rewrite `aiCascade.ts`
Change the base URL + auth header. Sketch:
```ts
const AI_BASE = "https://openrouter.ai/api/v1";
const AI_KEY = Deno.env.get("OPENROUTER_API_KEY");

const res = await fetch(`${AI_BASE}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${AI_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://yourdomain.com",
    "X-Title": "Manthana",
  },
  body: JSON.stringify({ model, messages, temperature, max_tokens }),
});
```
Map the model IDs the cascade requests (`google/gemini-2.5-pro`, `openai/gpt-5-mini`, …) to OpenRouter's model slugs — most match 1:1.

### 5d. Set the secret on the new Supabase
```bash
npx supabase secrets set OPENROUTER_API_KEY=sk-or-...
```
Remove `LOVABLE_API_KEY` from any `Deno.env.get` calls.

---

## 6. Deploy edge functions

```bash
for d in supabase/functions/*/; do
  name=$(basename "$d")
  [ "$name" = "_shared" ] && continue
  npx supabase functions deploy "$name"
done
```

Set the remaining runtime secrets the functions expect (see `Deno.env.get` calls):
```bash
npx supabase secrets set \
  OPENROUTER_API_KEY=... \
  RAZORPAY_MODE=test \
  RAZORPAY_KEY_ID_TEST=... \
  RAZORPAY_KEY_SECRET_TEST=... \
  RAZORPAY_KEY_ID_LIVE=... \
  RAZORPAY_KEY_SECRET_LIVE=... \
  RAZORPAY_WEBHOOK_SECRET=... \
  DEVELOPER_ACCESS_CODE=...
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` are injected automatically by Supabase — do not set them.

---

## 7. Search for any other Lovable references

```bash
rg -in "lovable" src supabase index.html package.json README.md
```
Expected leftovers to clean up:
- `package.json` — `lovable-tagger` devDependency and any `lovable-*` scripts; safe to remove outside Lovable.
- `vite.config.ts` — remove the `lovable-tagger` plugin import + usage.
- `index.html` — remove any `gpteng.co` / Lovable badge `<script>` tags.
- README badges / "Edit in Lovable" links — optional, cosmetic.
- Comments referring to "Lovable Cloud" — rename to "Supabase" for clarity.

```bash
npm uninstall lovable-tagger
```

---

## 8. Data migration (only if there's existing prod data)

Lovable does not give you `pg_dump` access to the old DB. Options:
- Per-table CSV export from the Lovable Cloud dashboard (Cloud → Database → Tables → Export), then `\copy` into the new DB.
- `auth.users` cannot be exported — existing users must re-sign-up, or you implement a one-time email-link migration flow.

If this is a fresh project with no production data, skip this section.

---

## 9. Verify

```bash
npm install
npm run dev
```
Smoke checklist:
- [ ] App loads, no console errors about missing env vars.
- [ ] Sign up with email/password works → row appears in new Supabase `auth.users` + `profiles`.
- [ ] Google sign-in works end-to-end.
- [ ] One AI-powered flow (e.g. analyze-study) returns a result — confirms `aiCascade.ts` rewrite is correct.
- [ ] File upload to `studies` bucket works.
- [ ] An edge function curl returns 200, not 401.

---

## 10. Quick "things that will break if you skip a step" reference

| Symptom | Cause |
|---|---|
| `401` from any edge function calling AI | Still hitting `ai.gateway.lovable.dev` with `LOVABLE_API_KEY` — step 5 not done |
| OAuth popup says "provider not enabled" | Google not enabled in new Supabase auth providers — step 4d |
| `relation "..." does not exist` | Migrations not pushed — step 3 |
| `Bucket not found: studies` | Storage buckets not created — step 3 |
| Types out of sync, red squiggles everywhere | `types.ts` not regenerated — step 2c |
| `process-email-queue` never runs | Cron job not recreated — step 3 |
| App still talks to `eqqwfdublzolqrfwzszc.supabase.co` | `.env` not updated, or built artifact cached — step 2a + rebuild |

Once all 10 sections are done, the project has zero runtime dependency on Lovable.
