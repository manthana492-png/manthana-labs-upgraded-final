// Shared cloud-AI cascade for Manthana Imaging Studio.
//
// Production routing policy (server-side only, never exposed to clients):
//
//   PRIMARY: Moonshot Direct API (kimi-k2.6 for analysis/reports, kimi-k2.5 for questionnaires)
//   FALLBACK: NVIDIA NIM API (moonshotai/kimi-k2.6 or moonshotai/kimi-k2.5)
//
// All other AI models and cascades (Lovable AI, Gemini, Llama, Qwen, DeepSeek) are completely removed.

const MOONSHOT_URL = "https://api.moonshot.ai/v1/chat/completions";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 90_000;

export type ChatRole = "system" | "user" | "assistant";
export type ChatContent =
  | string
  | Array<
    | { type: "text"; text: string }
    | {
      type: "image_url";
      image_url: { url: string; detail?: "low" | "high" | "auto" };
    }
  >;

export interface ChatMessage {
  role: ChatRole;
  content: ChatContent;
  reasoning_content?: string;
}

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type CascadeComplexity = "standard" | "high";

export interface CascadeOptions {
  messages: ChatMessage[];
  /** Target model slug. If not specified, inferred from complexity (high -> kimi-k2.6, standard -> kimi-k2.5) */
  modelSlug?: "kimi-k2.6" | "kimi-k2.5";
  /** If true, uses image-capable model (all Kimi models support vision). */
  vision?: boolean;
  complexity?: CascadeComplexity;
  /** Force JSON-object response format. */
  jsonObject?: boolean;
  /** OpenAI-style tool list for forced structured output. */
  tools?: unknown[];
  toolChoice?: unknown;
  temperature?: number;
  maxTokens?: number;
  /** Enable web search. Note: Web search might be incompatible with native thinking. */
  enableWebSearch?: boolean;
  webMaxResults?: number;
  referer?: string;
  title?: string;
  stream?: boolean;
  reasoningEffort?: ReasoningEffort;
  /** Override to disable thinking (e.g. for search / tool calling compatibility if needed) */
  thinkingDisabled?: boolean;
}

export interface CascadeStep {
  label: string;
  url: string;
  model: string;
  apiKey: string | undefined;
  supportsVision: boolean;
}

export interface CascadeResult {
  text: string;
  provider: string;
  toolArgs?: Record<string, unknown>;
  webAnnotations?: WebAnnotation[];
  streamBody?: ReadableStream<Uint8Array>;
  reasoningContent?: string;
}

export interface WebAnnotation {
  url: string;
  title?: string;
  snippet?: string;
}

const REFERER = "https://manthana.health";
const TITLE = "Manthana Imaging Studio";

/**
 * Build the model cascade for the current request.
 * Order: Moonshot Direct API -> NVIDIA NIM Fallback.
 */
export function buildCascade(
  modelSlug: "kimi-k2.6" | "kimi-k2.5"
): CascadeStep[] {
  const moonshotKey = Deno.env.get("MOONSHOT_API_KEY");
  const nvidiaKey = Deno.env.get("NVIDIA_API_KEY");
  const out: CascadeStep[] = [];

  // ── Tier 1: Moonshot Direct API ──────────────────────────────────────────
  if (moonshotKey) {
    out.push({
      label: `moonshot-direct-${modelSlug}`,
      url: MOONSHOT_URL,
      model: modelSlug,
      apiKey: moonshotKey,
      supportsVision: true,
    });
  }

  // ── Tier 2: NVIDIA NIM Fallback ──────────────────────────────────────────
  if (nvidiaKey) {
    out.push({
      label: `nvidia-nim-${modelSlug}`,
      url: NVIDIA_URL,
      model: `moonshotai/${modelSlug}`,
      apiKey: nvidiaKey,
      supportsVision: true,
    });
  }

  return out;
}

/**
 * Run the cascade until a provider succeeds. Throws if every step fails.
 */
export async function runChatCascade(opts: CascadeOptions): Promise<CascadeResult> {
  // Infer modelSlug if not provided
  const modelSlug = opts.modelSlug ?? (opts.complexity === "high" ? "kimi-k2.6" : "kimi-k2.5");
  const cascade = buildCascade(modelSlug);

  if (cascade.length === 0) {
    throw new Error("no_ai_provider_configured");
  }

  const errors: string[] = [];
  for (const step of cascade) {
    try {
      const toHeaderSafe = (s: string) =>
        s.normalize("NFKD").replace(/[^\x20-\x7E]/g, "-").trim() || "Manthana";
      const headers: Record<string, string> = {
        Authorization: `Bearer ${step.apiKey}`,
        "Content-Type": "application/json",
      };
      if (step.url === MOONSHOT_URL) {
        headers["HTTP-Referer"] = toHeaderSafe(opts.referer ?? REFERER);
        headers["X-Title"] = toHeaderSafe(opts.title ?? TITLE);
      }

      const payload: Record<string, unknown> = {
        model: step.model,
        messages: opts.messages.map(m => {
          const formatted: Record<string, unknown> = {
            role: m.role,
            content: m.content,
          };
          if (m.reasoning_content) {
            formatted.reasoning_content = m.reasoning_content;
          }
          return formatted;
        }),
        temperature: opts.temperature ?? (step.model.includes("k2.6") ? 1.0 : 0.2), // Moonshot recommends temperature=1.0 for Kimi K2.6 thinking
      };

      if (opts.maxTokens) payload.max_tokens = opts.maxTokens;
      
      if (opts.jsonObject && !opts.tools) {
        payload.response_format = { type: "json_object" };
      }
      if (opts.tools) {
        payload.tools = opts.tools;
        if (opts.toolChoice) payload.tool_choice = opts.toolChoice;
      }
      if (opts.stream) payload.stream = true;

      // Configure Kimi Native Thinking parameter
      if (opts.thinkingDisabled) {
        payload.thinking = { type: "disabled" };
      } else {
        // Native Kimi Thinking is enabled by default, but we explicitly pass configuration
        // to enable preserved thinking (keep: "all") across turns when available.
        payload.thinking = { type: "enabled", keep: "all" };
      }

      // Add web search plugin if requested AND thinking is disabled (since native search is incompatible with thinking)
      if (opts.enableWebSearch && opts.thinkingDisabled && step.url === MOONSHOT_URL) {
        payload.plugins = [
          { id: "web", max_results: opts.webMaxResults ?? 5 },
        ];
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const resp = await fetch(step.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        const msg = `${step.label} → HTTP ${resp.status}: ${text.slice(0, 300)}`;
        errors.push(msg);
        console.warn("[ai-cascade]", msg);
        continue;
      }

      if (opts.stream) {
        if (!resp.body) {
          errors.push(`${step.label} → empty stream body`);
          continue;
        }
        return { text: "", provider: step.label, streamBody: resp.body };
      }

      const data = await resp.json();
      const choice = data?.choices?.[0];
      const message = choice?.message ?? {};
      const raw = message?.content;
      const text = typeof raw === "string"
        ? raw
        : Array.isArray(raw)
          ? raw.map((c: { text?: string }) => c?.text ?? "").join("\n")
          : "";

      const reasoningContent = message?.reasoning_content as string | undefined;

      // Tool-call extraction
      let toolArgs: Record<string, unknown> | undefined;
      const toolCalls = message?.tool_calls as Array<{
        function?: { name?: string; arguments?: string };
      }> | undefined;
      if (toolCalls && toolCalls.length > 0) {
        const first = toolCalls[0];
        const argStr = first?.function?.arguments;
        if (typeof argStr === "string" && argStr.length > 0) {
          try { toolArgs = JSON.parse(argStr); } catch (e) {
            console.warn("[ai-cascade] tool args parse failed:", e);
          }
        }
      }

      // Web-search annotations
      const webAnnotations = extractWebAnnotations(message);

      if (!text && !toolArgs && !reasoningContent) {
        errors.push(`${step.label} → empty content`);
        continue;
      }
      return { text, provider: step.label, toolArgs, webAnnotations, reasoningContent };
    } catch (e) {
      const msg = `${step.label} → ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      console.warn("[ai-cascade]", msg);
    }
  }

  throw new Error(`all_providers_failed: ${errors.join(" | ")}`);
}

function extractWebAnnotations(message: unknown): WebAnnotation[] | undefined {
  const m = message as { annotations?: Array<Record<string, unknown>> };
  const ann = m?.annotations;
  if (!Array.isArray(ann) || ann.length === 0) return undefined;
  const out: WebAnnotation[] = [];
  for (const a of ann) {
    const cit = (a?.url_citation ?? a) as Record<string, unknown>;
    const url = (cit?.url ?? a?.url) as string | undefined;
    if (!url || typeof url !== "string" || !url.startsWith("http")) continue;
    out.push({
      url,
      title: (cit?.title as string | undefined) ?? undefined,
      snippet: (cit?.content as string | undefined) ?? (cit?.snippet as string | undefined),
    });
  }
  return out.length > 0 ? out : undefined;
}
