import { useState } from "react";
import { Flag, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFeedback, useAuth, type IncidentReport } from "@/lib/store";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const REASONS: { value: IncidentReport["reason"]; label: string }[] = [
  { value: "incorrect_finding", label: "Finding is incorrect" },
  { value: "missed_finding", label: "AI missed a finding" },
  { value: "wrong_severity", label: "Severity is wrong" },
  { value: "wrong_recommendation", label: "Recommendation is wrong" },
  { value: "other", label: "Other" },
];

export function IncidentReportButton({
  studyId,
  findingId,
  variant = "outline",
  size = "sm",
  className,
}: {
  studyId: string;
  findingId?: string;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<IncidentReport["reason"]>("incorrect_finding");
  const [detail, setDetail] = useState("");
  const fileIncident = useFeedback((s) => s.fileIncident);
  const doctor = useAuth((s) => s.doctor);

  const submit = () => {
    if (detail.trim().length < 10) {
      toast({ title: "Please add a brief detail (≥ 10 chars)" });
      return;
    }
    fileIncident({
      studyId,
      findingId,
      reason,
      detail: detail.trim(),
      doctorName: doctor?.fullName,
    });
    toast({
      title: "Feedback recorded",
      description: "Thank you — this report will improve the model.",
    });
    setOpen(false);
    setDetail("");
    setReason("incorrect_finding");
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className={cn("text-warning-critical-foreground border-warning-critical-border/50 hover:bg-warning-critical-soft", className)}
      >
        <Flag className="h-3.5 w-3.5 mr-1.5" />
        Flag AI output
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">Flag this AI output</DialogTitle>
            <DialogDescription>
              Your feedback is logged for the active-learning loop and your medico-legal record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">
                What's wrong?
              </label>
              <Select value={reason} onValueChange={(v) => setReason(v as IncidentReport["reason"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">
                Brief detail
              </label>
              <Textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value.slice(0, 500))}
                placeholder="What did the model get wrong, and what would you have reported instead?"
                className="min-h-[90px]"
              />
              <div className="text-[0.65rem] font-mono text-muted-foreground text-right mt-1">
                {detail.length} / 500
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button onClick={submit} className="bg-primary hover:bg-primary/90">
              <Send className="h-3.5 w-3.5 mr-1.5" /> Submit feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
