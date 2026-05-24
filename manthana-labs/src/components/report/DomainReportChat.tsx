import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Loader2, MessageSquare, Send, Sparkles, Stethoscope, Lock, ArrowUpRight,
  Maximize2, Minimize2, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { DOMAINS, type MedicalDomain } from "@/lib/domains";
import { LANGUAGES, isRtl } from "@/lib/languages";
import type { Study } from "@/lib/types";

type ChatMsg = { role: "user" | "assistant"; content: string };

const STARTERS: Record<MedicalDomain["id"], string[]> = {
  allopathy: [
    "Summarise the most actionable next step.",
    "Which red flags here need urgent referral?",
    "What guideline-based work-up would you suggest?",
  ],
  ayurveda: [
    "Interpret these findings through Tridosha with shlokas.",
    "Which Srotas and Dhatus are involved? Cite Charaka.",
    "Suggest a Pathya-Apathya plan with classical references.",
  ],
  homeopathy: [
    "Which miasm pattern fits, with Organon citations?",
    "Top 3 candidate remedies and their keynotes.",
    "Constitutional read-out from Materia Medica.",
  ],
  siddha: [
    "Read findings through Mukkutram with Agathiyar references.",
    "Suggest classical formulations with Pathiyam.",
    "What Naadi pattern would correlate?",
  ],
  unani: [
    "Interpret via Akhlat & Mizaj with Al-Qanun citations.",
    "Suggest Ilaj-bil-Tadbeer steps.",
    "Recommend classical Joshanda / Itrifal options.",
  ],
};

/**
 * DomainReportChat — domain-aware AI chat anchored to a finalized report.
 * Streams responses from the `domain-report-chat` edge function.
 */
export function DomainReportChat({ study }: { study: Study }) {
  const navigate = useNavigate();
  const [domain, setDomain] = useState<MedicalDomain["id"]>("allopathy");
  const [language, setLanguage] = useState<string>("English");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [cap, setCap] = useState<number>(2);
  const [used, setUsed] = useState<number>(0);
  const [planName, setPlanName] = useState<string>("Free");
  /** "compact" | "expanded" | "fullscreen" — controls transcript height */
  const [size, setSize] = useState<"compact" | "expanded" | "fullscreen">("compact");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const capReached = used >= cap;

  // Fetch tier limits + current chat usage on mount / study change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.functions.invoke("check-and-consume-quota", {
          body: { mode: "peek" },
        });
        if (cancelled || !data) return;
        setCap((data as any).limits?.chat_msgs_per_scan ?? 2);
        setPlanName((data as any).plan_name ?? "Free");
        const { data: cq } = await supabase
          .from("chat_quotas")
          .select("messages_used")
          .eq("study_id", study.id)
          .maybeSingle();
        if (!cancelled) setUsed(cq?.messages_used ?? 0);
      } catch { /* fall back to defaults */ }
    })();
    return () => { cancelled = true; };
  }, [study.id]);

  // Reset when domain switches — interpretations don't carry across systems.
  useEffect(() => { setMessages([]); }, [domain]);

  useEffect(() => {
    // Auto-scroll on every messages/streaming tick so the streaming reply is
    // always in view (the previous version missed late deltas on mobile).
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [messages, streaming]);

  // Body-scroll lock + Esc-to-exit while fullscreen.
  useEffect(() => {
    if (size !== "fullscreen") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSize("expanded");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [size]);

  const findingsPayload = useMemo(
    () => (study.report?.findings ?? []).map((f) => ({
      title: f.title,
      severity: f.severity,
      impression: f.impression,
      recommendation: f.recommendation,
      anatomicalRegion: f.anatomicalRegion,
      icd10Code: f.icd10Code,
    })),
    [study.report?.findings],
  );

  async function send(text: string) {
    if (!text.trim() || streaming || !study.report) return;
    if (used >= cap) {
      toast({
        title: "Chat cap reached",
        description: `You've used all ${cap} messages on the ${planName} plan. Upgrade for more.`,
      });
      return;
    }
    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/domain-report-chat`;
      const resp = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          domain,
          language,
          modality: study.modality.label,
          narrative: study.report.narrative,
          findings: findingsPayload,
          messages: next,
          studyId: study.id,
        }),
      });

      if (resp.status === 402) {
        toast({ title: "AI credits exhausted", description: "Add credits in Settings → Workspace." });
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      if (resp.status === 429) {
        const body = await resp.json().catch(() => ({}));
        toast({
          title: body.error === "chat_cap_reached" ? "Chat cap reached" : "Rate limited",
          description: body.message ?? "Please wait a moment and try again.",
        });
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      if (!resp.ok || !resp.body) throw new Error(`Chat error ${resp.status}`);
      setUsed((u) => u + 1);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) upsert(delta);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error(err);
      toast({ title: "Chat failed", description: "Please try again." });
      setMessages((prev) => (prev[prev.length - 1]?.role === "user" ? prev.slice(0, -1) : prev));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  const activeDomain = DOMAINS.find((d) => d.id === domain)!;
  const rtl = isRtl(LANGUAGES.find((l) => l.label === language)?.code ?? "en");

  // Transcript height per size mode. Uses dynamic-viewport units so mobile
  // browser chrome (URL bar, keyboard) doesn't clip the assistant reply.
  const transcriptHeight =
    size === "fullscreen"
      ? "h-full flex-1"
      : size === "expanded"
        ? "min-h-[22rem] max-h-[70dvh] sm:max-h-[36rem]"
        : "min-h-[14rem] max-h-[28rem]";

  const sectionClass =
    size === "fullscreen"
      ? "fixed inset-0 z-[60] bg-background flex flex-col p-4 sm:p-6 overflow-hidden"
      : "surface-clinical p-5 md:p-6";

  return (
    <section id="discuss-with-ai" className={sectionClass} data-pdf-skip="true">
      <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-xl tracking-tight inline-flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" /> Discuss this report
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Domain-aware AI co-pilot · grounded in classical / clinical references
          </p>
        </div>
        <div className="flex items-center gap-1">
          {size !== "fullscreen" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSize(size === "compact" ? "expanded" : "compact")}
              className="h-8 px-2 text-xs text-muted-foreground"
              aria-label={size === "compact" ? "Expand chat" : "Collapse chat"}
              title={size === "compact" ? "Expand chat" : "Collapse chat"}
            >
              {size === "compact" ? (
                <><ChevronDown className="h-3.5 w-3.5 mr-1" />Expand</>
              ) : (
                <><ChevronUp className="h-3.5 w-3.5 mr-1" />Collapse</>
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setSize(size === "fullscreen" ? "expanded" : "fullscreen")}
            className="h-8 w-8 text-muted-foreground"
            aria-label={size === "fullscreen" ? "Exit fullscreen chat" : "Fullscreen chat"}
            title={size === "fullscreen" ? "Exit fullscreen (Esc)" : "Fullscreen"}
          >
            {size === "fullscreen" ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Body — flex column so fullscreen distributes space correctly */}
      <div className={cn("flex flex-col min-h-0", size === "fullscreen" && "flex-1")}>
        {/* Domain picker — collapses on mobile fullscreen to a horizontal scroll row */}
        <div
          className={cn(
            "gap-2 mb-3",
            size === "fullscreen"
              ? "flex overflow-x-auto pb-1 sm:grid sm:grid-cols-3 lg:grid-cols-5"
              : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
          )}
        >
          {DOMAINS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDomain(d.id)}
              className={cn(
                "flex flex-col items-start justify-start text-left rounded-xl border px-3 py-2.5 transition focus-ring h-full min-h-[60px]",
                size === "fullscreen" ? "shrink-0 w-[10rem] sm:w-auto" : "",
                domain === d.id
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-surface hover:border-primary/40",
              )}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium leading-tight w-full">
                <span aria-hidden className="shrink-0">{d.emoji}</span>
                <span className="truncate">{d.label}</span>
              </div>
              <div className="text-[0.65rem] text-muted-foreground mt-1 leading-snug line-clamp-2 w-full">
                {d.blurb}
              </div>
            </button>
          ))}
        </div>

        {/* Language + meta */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">Reply in</span>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.label} className="text-xs">
                  {l.label} · <span className="text-muted-foreground">{l.native}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[0.65rem] text-muted-foreground italic ml-auto inline-flex items-center gap-1.5">
            <Sparkles className="h-2.5 w-2.5" />
            {used} / {cap} msgs · {planName} · Manthana‑Labs clinical AI
          </span>
        </div>

        {/* Transcript */}
        <div
          ref={scrollRef}
          className={cn(
            "rounded-xl border border-border bg-surface overflow-y-auto p-3 sm:p-4 space-y-3 overscroll-contain",
            transcriptHeight,
          )}
          dir={rtl ? "rtl" : "ltr"}
          aria-live="polite"
          aria-busy={streaming}
        >
          {messages.length === 0 && !streaming && (
            <div className="text-center py-8">
              <Stethoscope className="h-7 w-7 mx-auto text-muted-foreground/60 mb-2" />
              <div className="text-sm text-muted-foreground">
                Ask anything about this report through the lens of <strong>{activeDomain.label}</strong>.
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                {STARTERS[domain].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-[0.7rem] px-2.5 py-1 rounded-full border border-border bg-surface-raised hover:border-primary/40 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const isLastAssistant =
              m.role === "assistant" && i === messages.length - 1 && streaming;
            return (
              <div
                key={i}
                className={cn(
                  "rounded-lg px-3 py-2 max-w-[92%] text-sm leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-primary/10 border border-primary/20"
                    : "mr-auto bg-surface-raised border border-border",
                )}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-2 prose-li:my-0 break-words">
                    {m.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    ) : (
                      <span className="text-muted-foreground inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Reasoning through {activeDomain.label}…
                      </span>
                    )}
                    {isLastAssistant && m.content && (
                      <span className="ml-0.5 inline-block w-1.5 h-4 align-middle bg-primary/70 animate-pulse rounded-sm" />
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                )}
              </div>
            );
          })}

          {/* Pre-first-token indicator (last message is the user's) */}
          {streaming && messages[messages.length - 1]?.role === "user" && (
            <div className="mr-auto bg-surface-raised border border-border rounded-lg px-3 py-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Reasoning through {activeDomain.label}…
            </div>
          )}
        </div>
      </div>

      {/* Cap reached banner */}
      {capReached && !streaming && (
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div className="rounded-lg bg-primary/15 p-2 shrink-0">
              <Lock className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-medium">Chat cap reached on {planName}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                You've used all {cap} message{cap === 1 ? "" : "s"} for this report. Upgrade for a larger
                per-report context, more messages, and priority queue.
              </div>
            </div>
          </div>
          <Button
            onClick={() => navigate("/app/billing")}
            className="bg-primary hover:bg-primary/90 shrink-0"
            size="sm"
          >
            Upgrade plan
            <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      )}

      {/* Composer */}
      <div className="mt-3 flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            capReached
              ? `Cap reached — upgrade to continue chatting`
              : `Ask in ${language} — e.g. "${STARTERS[domain][0]}"`
          }
          className="min-h-[44px] max-h-32 resize-none text-sm"
          dir={rtl ? "rtl" : "ltr"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          disabled={streaming || capReached}
        />
        {streaming ? (
          <Button variant="outline" onClick={stop} className="h-11">Stop</Button>
        ) : capReached ? (
          <Button
            onClick={() => navigate("/app/billing")}
            className="h-11 bg-primary hover:bg-primary/90"
          >
            Upgrade
          </Button>
        ) : (
          <Button
            onClick={() => send(input)}
            disabled={!input.trim()}
            className="h-11 bg-primary hover:bg-primary/90"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>

      <p className="mt-2 text-[0.65rem] text-muted-foreground italic flex items-center gap-1">
        <Sparkles className="h-3 w-3" />
        Educational support only — final clinical decisions remain with the treating doctor.
      </p>
    </section>
  );
}
