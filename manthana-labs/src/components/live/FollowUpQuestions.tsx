// Renders the model's follow-up questions as a card stack, collects answers.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight } from "lucide-react";
import type { FollowUpQuestion } from "@/lib/types";

interface FollowUpQuestionsProps {
  questions: FollowUpQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  busy?: boolean;
}

export function FollowUpQuestions({ questions, onSubmit, busy }: FollowUpQuestionsProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  function setAnswer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }

  function handleSubmit() {
    onSubmit(answers);
  }

  if (questions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">No follow-up questions — generating final report…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Follow-up — {questions.length} question{questions.length === 1 ? "" : "s"}
        </div>
        <h3 className="font-display text-xl tracking-tight mt-1">
          Help Manthana‑Labs sharpen the diagnosis
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Quick clarifying questions raised after the first analysis pass.
        </p>
      </div>

      <ul className="space-y-3">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-border bg-card p-4">
            <div className="text-[0.7rem] text-muted-foreground font-medium mb-1.5">
              Q{i + 1}
            </div>
            <div className="font-medium text-sm mb-3">{q.question}</div>
            {q.kind === "yesno" ? (
              <div className="flex gap-2">
                {["Yes", "No", "Unsure"].map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    variant={answers[q.id] === opt ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAnswer(q.id, opt)}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            ) : q.kind === "choice" && q.options ? (
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    variant={answers[q.id] === opt ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAnswer(q.id, opt)}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            ) : (
              <Textarea
                placeholder="Type your answer…"
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                rows={2}
              />
            )}
          </li>
        ))}
      </ul>

      <Button
        size="lg"
        onClick={handleSubmit}
        disabled={busy}
        className="w-full bg-tier-hybrid hover:bg-tier-hybrid/90 text-white"
      >
        {busy ? "Generating final report…" : (
          <>Submit & generate report <ArrowRight className="ml-1.5 h-4 w-4" /></>
        )}
      </Button>
    </div>
  );
}
