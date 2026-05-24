import { AppShell } from "@/components/layout/AppShell";
import { CompareWizard } from "@/components/study/CompareWizard";
import { usePlan, isProOrAbove } from "@/lib/usePlan";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, ArrowRight, Lock, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

const CompareStudy = () => {
  const { plan, loading } = usePlan();
  const navigate = useNavigate();

  return (
    <AppShell>
      <header className="mb-6 flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <ArrowLeftRight className="h-6 w-6" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Compare mode · longitudinal
          </div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight mt-0.5">
            Same patient · same modality · 2–4 timepoints · one interval-change report
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Upload prior &amp; current studies of the SAME modality to see exactly what
            improved, stayed stable, worsened or appeared new. Every uploaded image is
            embedded directly in the PDF report.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="surface-clinical p-10 text-center text-sm text-muted-foreground">
          Checking your plan…
        </div>
      ) : !isProOrAbove(plan) ? (
        <UpgradeGate onUpgrade={() => navigate("/pricing")} />
      ) : (
        <CompareWizard />
      )}
    </AppShell>
  );
};

function UpgradeGate({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="surface-clinical p-8 md:p-10 relative overflow-hidden">
      <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="relative max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1 text-[0.7rem] uppercase tracking-wider text-muted-foreground mb-4">
          <Lock className="h-3 w-3" /> Pro &amp; Pro+ feature
        </div>
        <h2 className="font-display text-2xl md:text-3xl tracking-tight">
          Compare mode is a Pro feature.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Longitudinal interval-change reading is a clinical superpower — knowing whether
          a finding is improving, stable, worsening or new changes management entirely.
          Reserved for Pro and Pro+ subscriptions; consumes 2 scan units per compare
          study.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={onUpgrade}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            See upgrade options
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
          <Link to="/app">
            <Button variant="outline">Back to studio</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default CompareStudy;
