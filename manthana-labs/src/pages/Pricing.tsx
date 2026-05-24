import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Zap, Crown, Building2, ArrowRight, Clock, AlertTriangle, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { CampApplicationDialog } from "@/components/billing/CampApplicationDialog";
import { Seo } from "@/components/seo/Seo";

interface PlanRow {
  code: string;
  name: string;
  price_inr_monthly: number;
  monthly_scan_quota: number;
  daily_scan_addon: number;
  emergency_pool: number;
  chat_msgs_per_scan: number;
  context_window_msgs: number;
  max_tokens_per_reply: number;
  priority_queue: boolean;
  description: string | null;
  features: unknown;
  display_order: number;
}

const PLAN_ICON: Record<string, typeof Sparkles> = {
  free: Sparkles,
  pro: Zap,
  pro_plus: Crown,
  enterprise: Building2,
};

const Pricing = () => {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [campOpen, setCampOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_public", true)
      .order("display_order")
      .then(({ data }) => setPlans((data ?? []) as PlanRow[]));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-paper">
      {/* Nav */}
      <header className="container flex h-16 items-center justify-between">
        <Link to="/"><Logo /></Link>
        <div className="flex items-center gap-2">
          <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-accent/50">
            Sign in
          </Link>
          <Button size="sm" onClick={() => navigate("/signup")} className="bg-primary hover:bg-primary/90">
            Get started
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-12 md:py-20 max-w-3xl">
        <Seo
          title="Pricing — Manthana-Labs Clinical AI Co-Pilot"
          description="Transparent INR pricing for Indian clinicians. Free emergency scans for life. Pro and Pro+ plans for daily practice, premium models, and priority queue."
          path="/pricing"
          jsonLd={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Is there a free plan?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes. Every verified clinician gets 3 emergency scans free for life on the Free plan.",
                },
              },
              {
                "@type": "Question",
                name: "How is billing handled?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "All paid plans are billed in INR through Razorpay, GST inclusive. You can upgrade, downgrade, or cancel from the Billing page.",
                },
              },
              {
                "@type": "Question",
                name: "What does Pro+ add over Pro?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Pro+ doubles your monthly scan quota to 120, gives a longer chat context window, premium AI models, and priority GPU queue during peak load.",
                },
              },
              {
                "@type": "Question",
                name: "Do you offer enterprise or hospital pricing?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes. Hospitals, camps, and group practices can request a custom quote with shared quota pools and SSO.",
                },
              },
            ],
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Pricing · INR · GST inclusive
          </div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tight">
            Plans that respect a doctor's wallet.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Every clinician gets <strong className="text-foreground">3 emergency scans free for life</strong>.
            Upgrade only when your practice needs more — predictable monthly scans, longer chats, premium models, priority queue.
          </p>
        </motion.div>
      </section>

      {/* GPU fair-use notice */}
      <section className="container pb-8">
        <div className="surface-clinical p-5 md:p-6 flex items-start gap-3">
          <Clock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-foreground">GPU fair-use queue</div>
            <p className="text-muted-foreground mt-1">
              Manthana‑Labs runs on shared GPU clusters. Most scans return in under 60 seconds, but during peak load
              your study may briefly queue. Reserve <strong className="text-foreground">urgent / emergency scans</strong> for genuine
              clinical need — abuse delays a real patient somewhere else. Pro+ subscribers get priority queue.
            </p>
          </div>
        </div>
      </section>

      {/* Plan grid */}
      <section className="container pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => {
            const Icon = PLAN_ICON[p.code] ?? Sparkles;
            const featured = p.code === "pro_plus";
            const isEnterprise = p.code === "enterprise";
            return (
              <motion.div
                key={p.code}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: p.display_order * 0.05 }}
                className={
                  "surface-clinical p-6 flex flex-col " +
                  (featured ? "ring-2 ring-primary/40 shadow-lg" : "")
                }
              >
                {featured && (
                  <Badge className="self-start mb-3 bg-primary/15 text-primary border-primary/20">
                    Most popular
                  </Badge>
                )}
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="font-display text-2xl tracking-tight">{p.name}</div>
                <p className="text-xs text-muted-foreground mt-1 min-h-[2.5rem]">
                  {p.description}
                </p>

                <div className="mt-4">
                  {isEnterprise ? (
                    <div className="font-display text-3xl">Custom</div>
                  ) : p.price_inr_monthly === 0 ? (
                    <div>
                      <span className="font-display text-4xl">Free</span>
                      <span className="text-xs text-muted-foreground ml-2">for lifetime</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl">₹{p.price_inr_monthly}</span>
                      <span className="text-sm text-muted-foreground">/month</span>
                    </div>
                  )}
                </div>

                <ul className="mt-5 space-y-2 text-sm flex-1">
                  <Bullet>
                    {isEnterprise ? "Custom scan volume"
                      : p.code === "free" ? "3 emergency scans for life + 2 auto-grant on request"
                      : `${p.monthly_scan_quota} scans / month`}
                  </Bullet>
                  <Bullet>
                    {p.chat_msgs_per_scan} AI chat messages per report
                  </Bullet>
                  <Bullet>
                    {p.context_window_msgs}-message context window
                  </Bullet>
                  <Bullet>
                    Max {p.max_tokens_per_reply.toLocaleString()} tokens per reply
                  </Bullet>
                  {p.priority_queue && <Bullet>Priority GPU queue</Bullet>}
                  {p.code === "free" && <Bullet>Request additional emergency scans on demand</Bullet>}
                  {p.code === "pro" && <Bullet>Up to 3 emergency requests / month</Bullet>}
                  {p.code === "pro_plus" && <Bullet>Up to 6 emergency requests / month</Bullet>}
                  {isEnterprise && <Bullet>Custom SLA, dedicated support, on-prem option</Bullet>}
                </ul>

                <div className="mt-6">
                  {isEnterprise ? (
                    <a href="mailto:info@quaasx108.com?subject=Enterprise%20enquiry">
                      <Button variant="outline" className="w-full">
                        <Mail className="h-4 w-4 mr-2" />
                        Contact sales
                      </Button>
                    </a>
                  ) : p.code === "free" ? (
                    <Button onClick={() => navigate("/signup")} variant="outline" className="w-full">
                      Start free
                    </Button>
                  ) : (
                    <Button
                      onClick={() => navigate("/app/billing")}
                      className={featured ? "w-full bg-primary hover:bg-primary/90" : "w-full"}
                      variant={featured ? "default" : "outline"}
                    >
                      Choose {p.name} <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        <p className="mt-6 text-xs text-muted-foreground text-center">
          All plans include domain-aware AI chat (Allopathy / Ayurveda / Homeopathy / Siddha / Unani),
          13 Indian-language translation, ICD-10 + SNOMED coding, cryptographic sign-off and DPDP-aligned audit log.
          Multi-model clinical AI stack with automatic fallback for resilience.
        </p>
      </section>

      {/* Camp programme */}
      <section className="container pb-12">
        <div className="surface-clinical p-6 md:p-10 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative max-w-2xl">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Free Camp Programme
            </div>
            <h2 className="font-display text-3xl md:text-4xl tracking-tight">
              Running a free medical camp? We want to help.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Verified clinics with registered doctors and recognised medical-education institutions can
              apply for <strong className="text-foreground">50–70% concession</strong>, or even
              <strong className="text-foreground"> fully sponsored access up to 1,000 scans / month</strong>,
              decided case-by-case by our evaluating team.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => setCampOpen(true)} className="bg-primary hover:bg-primary/90">
                Apply for camp programme
              </Button>
              <a href="mailto:info@quaasx108.com?subject=Free%20camp%20programme%20enquiry">
                <Button variant="outline">
                  <Mail className="h-4 w-4 mr-2" />
                  info@quaasx108.com
                </Button>
              </a>
            </div>
            <p className="mt-3 text-[0.7rem] text-muted-foreground">
              Eligible: registered clinics (with both doctor &amp; clinic registration numbers) and
              recognised medical-education institutions. Camps must be free or non-commercial.
            </p>
          </div>
        </div>
      </section>

      {/* Misuse caution */}
      <section className="container pb-16">
        <div className="rounded-xl border border-warn/30 bg-warn-soft/40 p-5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warn-foreground mt-0.5 shrink-0" />
          <div className="text-sm text-warn-foreground/90">
            <div className="font-medium">A gentle but firm note on identity</div>
            <p className="mt-1">
              We allow minor mismatches in name spelling or transliteration during council verification — we trust
              clinicians to use the platform fairly. Misusing another doctor's registration number or otherwise
              faking identity is a direct violation of our terms; legal and professional consequences (including
              council action) rest entirely with the individual who attempted it. Please use Manthana‑Labs with the
              same integrity you bring to your patients.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/70">
        <div className="container py-8 grid gap-4 md:grid-cols-3 text-xs text-muted-foreground">
          <div className="space-y-1">
            <div className="text-foreground font-medium">Manthana‑Labs</div>
            <div>A product of <span className="font-medium text-foreground">Quaasx 108 Private Limited</span></div>
            <div>Bengaluru, India · © {new Date().getFullYear()}</div>
          </div>
          <div className="space-y-1">
            <div className="text-foreground font-medium">Contact</div>
            <a href="mailto:info@quaasx108.com" className="hover:text-foreground transition">
              info@quaasx108.com
            </a>
            <div className="text-muted-foreground/80 mt-1">
              Clinical Lead: <span className="text-foreground">Dr. M.D. Samudri</span>
            </div>
          </div>
          <div className="space-y-1 md:text-right">
            <div className="text-foreground font-medium">More</div>
            <div className="flex md:justify-end gap-4">
              <Link to="/" className="hover:text-foreground">Home</Link>
              <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
            </div>
          </div>
        </div>
      </footer>

      <CampApplicationDialog open={campOpen} onOpenChange={setCampOpen} />
    </div>
  );
};

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2">
    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
    <span className="text-foreground/90">{children}</span>
  </li>
);

export default Pricing;
