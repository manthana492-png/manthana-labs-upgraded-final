# Modal GPU Inference Contract

The `analyze-study` Edge Function POSTs to `MODAL_INFERENCE_URL` for **Tier A** and **Tier B** modalities (NVIDIA-backed). Modal runs the GPU pipeline (Triton + MONAI + VISTA-3D / TotalSegmentator / etc.) **asynchronously** and POSTs the result back to `analyze-study-callback`.

> Modal **never** needs the Supabase service-role key. It receives signed URLs to download files and authenticates its callback using a shared HMAC secret.

---

## 1. Inbound (Edge → Modal)

`POST {MODAL_INFERENCE_URL}`

```http
Content-Type: application/json
Authorization: Bearer {MODAL_AUTH_TOKEN}     # optional, sent if secret is set
X-Manthana-Callback-Url: https://<project-ref>.supabase.co/functions/v1/analyze-study-callback
```

```json
{
  "study_id": "5b7f...uuid",
  "modality_slug": "ct-chest-non-contrast",
  "modality_category": "ct",
  "tier": "A",
  "questionnaire_answers": { "age": 62, "smoker": true, ... },
  "files": [
    {
      "path": "user-uuid/study-uuid/sanitized/IMG-0001.dcm",
      "filename": "IMG-0001.dcm",
      "mime_type": "application/dicom",
      "signed_url": "https://...supabase.co/storage/v1/object/sign/studies/...",
      "expires_at": "2026-04-25T12:34:56Z"
    }
  ]
}
```

**Modal must respond within 10 s** with one of:

| HTTP | Body | Meaning |
|------|------|---------|
| `202 Accepted` | `{"job_id": "modal-abc123"}` | Job queued; results will arrive via callback. |
| `200 OK` | full result envelope (see §3) | Synchronous result (rare; OK for very fast jobs). |
| `4xx / 5xx` | `{"error": "..."}` | Edge will mark study `error` and surface message. |

---

## 2. Callback authentication (HMAC)

Every callback request must include:

```http
X-Manthana-Signature: hex(HMAC-SHA256(secret = MODAL_CALLBACK_HMAC_SECRET, message = raw_body))
X-Manthana-Timestamp: 1745596800           # unix seconds, must be within ±5 min
```

The Edge Function verifies the signature in constant time before writing anything. Replay attacks are blocked by the timestamp window.

Python example (Modal side):

```python
import hmac, hashlib, time, json, requests, os

body = json.dumps(payload, separators=(",", ":")).encode()
ts = str(int(time.time()))
sig = hmac.new(
    os.environ["MANTHANA_CALLBACK_HMAC"].encode(),
    body, hashlib.sha256,
).hexdigest()

requests.post(
    callback_url,
    data=body,
    headers={
        "Content-Type": "application/json",
        "X-Manthana-Signature": sig,
        "X-Manthana-Timestamp": ts,
    },
    timeout=30,
)
```

---

## 3. Outbound (Modal → Edge callback)

`POST /functions/v1/analyze-study-callback`

### Success envelope

```json
{
  "study_id": "5b7f...uuid",
  "job_id": "modal-abc123",
  "status": "ok",
  "report": {
    "narrative": "Non-contrast CT chest demonstrates a 14 mm spiculated nodule in the right upper lobe...",
    "overallConfidence": 0.91,
    "informationGaps": ["No prior imaging available for comparison."],
    "foundationModelCaveat": null,
    "findings": [
      {
        "title": "Right upper lobe pulmonary nodule",
        "description": "14 mm spiculated nodule in the apical segment of RUL.",
        "severity": "high",
        "confidence": 0.93,
        "region": "Right upper lobe, apical segment",
        "anatomicalRegion": "thorax",
        "observation": "Spiculated soft-tissue density measuring 14 mm.",
        "impression": "Suspicious for primary lung malignancy.",
        "recommendation": "PET-CT and tissue sampling per Fleischner.",
        "icd10Code": "R91.1",
        "icd10Label": "Solitary pulmonary nodule",
        "snomedCode": "427359005",
        "snomedLabel": "Solitary nodule of lung",
        "urgency": "urgent",
        "differentials": [
          { "dx": "Primary bronchogenic carcinoma", "likelihood": 0.65 },
          { "dx": "Granuloma",                       "likelihood": 0.20 }
        ]
      }
    ]
  }
}
```

### Failure envelope

```json
{
  "study_id": "5b7f...uuid",
  "job_id": "modal-abc123",
  "status": "error",
  "error": "GPU OOM after 3 retries"
}
```

The Edge Function will:

1. Verify HMAC + timestamp.
2. Look up the study by `study_id` and confirm `modal_job_id` matches.
3. **On success**: write `narrative`, `overall_confidence`, `information_gaps`, `foundation_model_caveat`; insert each `finding`; set `status='awaiting_review'` + `progress={stage:"complete",percent:100}`.
4. **On error**: set `status='error'` + `error_message`.
5. Append `audit_log` entry. Realtime pushes the update to the frontend.

---

## 4. Test it without Modal

```bash
TS=$(date +%s)
BODY='{"study_id":"<id>","job_id":"test","status":"ok","report":{"narrative":"test","overallConfidence":0.8,"findings":[]}}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$MODAL_CALLBACK_HMAC_SECRET" -hex | awk '{print $2}')

curl -X POST https://<project-ref>.supabase.co/functions/v1/analyze-study-callback \
  -H "Content-Type: application/json" \
  -H "X-Manthana-Signature: $SIG" \
  -H "X-Manthana-Timestamp: $TS" \
  -d "$BODY"
```

---

## 5. Required secrets (Edge side)

| Secret | Purpose |
|--------|---------|
| `MODAL_INFERENCE_URL` | Where to POST jobs. If unset, Tier A/B gracefully downgrades to Tier C. |
| `MODAL_AUTH_TOKEN` | Optional bearer token sent to Modal. |
| `MODAL_CALLBACK_HMAC_SECRET` | Required for callback verification. |
| `OPENROUTER_API_KEY` | Tier C primary model (Kimi K2.5). Falls back to Lovable Gemini if unset. |
