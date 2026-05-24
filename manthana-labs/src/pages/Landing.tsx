import { Link, useNavigate } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/tier/TierBadge";
import { useAuth } from "@/lib/store";
import { LANGUAGES } from "@/lib/languages";
import { DOMAINS } from "@/lib/domains";
import {
  ArrowRight, ShieldCheck, Sparkles, Activity, Layers, Lock, Stethoscope,
  Languages, MessageSquare, FileSignature, KeyRound, AlertTriangle,
  ListChecks, Fingerprint, BookMarked, Volume2, FileJson, Boxes,
  Eye, GitCompare, Heart, Search, Cpu, Award, BadgeCheck, Code2, HeartPulse,
  Clock, Zap, Crown, Mail, Check, Tent, UserCheck, Ban,
} from "lucide-react";
import { motion } from "framer-motion";
import { InstallButton } from "@/components/pwa/InstallButton";
import { Seo } from "@/components/seo/Seo";
import { useState, useCallback } from "react";

const MARQUEE_ITEMS = [
  "CT Chest Scan", "Brain MRI", "Thorax X-Ray", "Whole-Slide Pathology", "Cardiac ECG", 
  "Dental Panorex", "Ophthalmic Fundus", "Dermoscopy Analysis", "AYUSH Nadi Evaluation",
  "Pelvic Ultrasound", "Spine MRI", "Abdomen CT", "Thyroid Sonography", "Bone Densitometry"
];

const Landing = () => {
  const navigate = useNavigate();
  const { doctor, attestedAt } = useAuth();

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }, []);

  const goStudio = () => {
    if (!doctor) navigate("/login");
    else if (!attestedAt) navigate("/attestation");
    else navigate("/app");
  };

  return (
    <div className="min-h-screen bg-gradient-paper">
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          display: inline-flex;
          animation: marquee 38s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
        @keyframes gradient-border {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .gradient-border-animate {
          background-size: 200% 200%;
          animation: gradient-border 3s ease infinite;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px hsl(var(--primary)/0.15); }
          50% { box-shadow: 0 0 35px hsl(var(--primary)/0.3); }
        }
        .animate-pulse-glow {
          animation: pulse-glow 3s ease-in-out infinite;
        }
        @keyframes shimmer-multi {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .shimmer-multi {
          background: linear-gradient(90deg, transparent 0%, hsl(var(--primary-glow)/0.4) 25%, hsl(var(--primary)/0.6) 50%, hsl(var(--primary-glow)/0.4) 75%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmer-multi 2.5s ease-in-out infinite;
        }
        @keyframes icon-bounce {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-4px) rotate(-5deg); }
          75% { transform: translateY(-4px) rotate(5deg); }
        }
        .icon-bounce:hover {
          animation: icon-bounce 0.6s ease-in-out;
        }
        @keyframes icon-spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .icon-spin-slow:hover {
          animation: icon-spin-slow 0.8s ease-in-out;
        }
        @keyframes particle-float {
          0% { transform: translate(0, 0) scale(1); opacity: 0.3; }
          25% { transform: translate(10px, -15px) scale(1.1); opacity: 0.5; }
          50% { transform: translate(-5px, -25px) scale(0.9); opacity: 0.4; }
          75% { transform: translate(-15px, -10px) scale(1.05); opacity: 0.35; }
          100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
        }
        .particle {
          animation: particle-float 8s ease-in-out infinite;
        }
        .card-3d {
          transform-style: preserve-3d;
          transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s ease;
        }
        .card-3d:hover {
          transform: perspective(1000px) rotateX(2deg) rotateY(-2deg) translateZ(10px);
        }
        @keyframes blob-morph {
          0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(0, 0) rotate(0deg) scale(1); }
          25% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; transform: translate(20px, -30px) rotate(5deg) scale(1.05); }
          50% { border-radius: 50% 60% 30% 60% / 30% 50% 60% 40%; transform: translate(-10px, 20px) rotate(-3deg) scale(0.95); }
          75% { border-radius: 40% 30% 60% 50% / 60% 40% 50% 30%; transform: translate(15px, 10px) rotate(2deg) scale(1.02); }
        }
        .blob-morph {
          animation: blob-morph 12s ease-in-out infinite;
        }
        @keyframes blob-morph-slow {
          0%, 100% { border-radius: 40% 60% 50% 50% / 50% 40% 60% 50%; transform: translate(0, 0) rotate(0deg) scale(1); }
          33% { border-radius: 60% 40% 40% 60% / 40% 60% 40% 60%; transform: translate(-30px, 15px) rotate(-5deg) scale(1.08); }
          66% { border-radius: 50% 50% 60% 40% / 60% 40% 50% 50%; transform: translate(20px, -20px) rotate(3deg) scale(0.92); }
        }
        .blob-morph-slow {
          animation: blob-morph-slow 16s ease-in-out infinite;
        }
        .magnetic-btn {
          transition: transform 0.15s ease-out;
        }
        @keyframes border-glow-rotate {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .border-glow-rotate {
          background: linear-gradient(90deg, hsl(var(--primary)/0.4), hsl(var(--primary-glow)/0.6), hsl(var(--tier-nvidia)/0.4), hsl(var(--primary)/0.4));
          background-size: 300% 300%;
          animation: border-glow-rotate 4s ease infinite;
        }
        .glass-premium {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.05), 0 8px 32px 0 rgba(0, 0, 0, 0.1);
        }
        @keyframes reveal-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .reveal-up {
          opacity: 0;
        }
        .reveal-up.is-visible {
          animation: reveal-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes type-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .type-cursor::after {
          content: '|';
          animation: type-cursor 1s step-end infinite;
          margin-left: 2px;
          color: hsl(var(--primary));
        }
      `}</style>
      <Seo
        title="Manthana-Labs — Clinical AI Imaging Co-Pilot for Doctors in India"
        description="AI-assisted analysis across 128 medical imaging modalities — Allopathy + AYUSH. Multi-modality, comparison studies, and signed reports for licensed clinicians in India."
        path="/"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "MedicalWebPage",
            name: "Manthana-Labs — Clinical AI Imaging Co-Pilot",
            about: {
              "@type": "MedicalBusiness",
              name: "Manthana-Labs by Quaasx 108 Private Limited",
              medicalSpecialty: ["Radiology", "Pathology", "Cardiology", "Dermatology", "Ayurveda", "Homeopathy"],
            },
            publisher: {
              "@type": "Organization",
              name: "Quaasx 108 Private Limited",
              url: "https://manthana.quaasx108.com/",
            },
            inLanguage: "en-IN",
          },
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Manthana-Labs: an AI co-pilot built for Indian clinicians",
            description:
              "How Manthana-Labs supports licensed clinicians across Allopathy and AYUSH with AI-assisted analysis on 128 medical imaging modalities and signed reports.",
            image: "https://manthana.quaasx108.com/icons/icon-512.png",
            author: { "@type": "Organization", name: "Quaasx 108 Private Limited" },
            publisher: {
              "@type": "Organization",
              name: "Quaasx 108 Private Limited",
              logo: {
                "@type": "ImageObject",
                url: "https://manthana.quaasx108.com/icons/icon-512.png",
              },
            },
            mainEntityOfPage: "https://manthana.quaasx108.com/",
            inLanguage: "en-IN",
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Who can use Manthana-Labs?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Licensed clinicians in India registered with NMC, NCISM, NCH, or DCI. Registration is verified before activation.",
                },
              },
              {
                "@type": "Question",
                name: "Which imaging modalities are supported?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "128 medical imaging modalities across Allopathy and AYUSH — including X-ray, CT, MRI, ultrasound, ECG, dermatology photography, ophthalmology, and pathology slides. Upload photos and clips exported from your viewer.",
                },
              },
              {
                "@type": "Question",
                name: "Is the AI a replacement for the doctor?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "No. AI outputs are decision-support only. The treating clinician is responsible for diagnosis and treatment.",
                },
              },
              {
                "@type": "Question",
                name: "How is patient data protected?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Data is encrypted at rest and in transit. Studies can be deleted by the clinician at any time. Analytics cookies load only after explicit consent.",
                },
              },
            ],
          },
        ]}
      />
      {/* Nav */}
      <header className="container flex h-16 items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <Link
            to="/pricing"
            className="hidden sm:inline-flex text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-accent/50 transition focus-ring"
          >
            Pricing
          </Link>
          <Link
            to="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-accent/50 transition focus-ring"
          >
            Sign in
          </Link>
          <ThemeSwitcher />
          <Button
            size="sm"
            onClick={() => navigate("/signup")}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Apply for access
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" onMouseMove={handleMouseMove}>
        {/* Futuristic backdrop */}
        <div className="absolute inset-0 bg-aurora pointer-events-none" />
        {/* Cursor-tracking spotlight */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40 transition-all duration-300 ease-out"
          style={{
            background: `radial-gradient(600px circle at ${mousePos.x}% ${mousePos.y}%, hsl(var(--primary)/0.12), transparent 60%)`,
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--primary)/0.35) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)/0.35) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at 30% 20%, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at 30% 20%, black 30%, transparent 75%)",
          }}
        />
        {/* Glow orbs */}
        <div className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-primary/20 blur-[120px] pointer-events-none" />
        <div className="absolute top-20 right-0 h-[22rem] w-[22rem] rounded-full bg-tier-nvidia/15 blur-[110px] pointer-events-none" />
        {/* Animated mesh blob shapes */}
        <div className="absolute top-1/4 right-1/4 w-72 h-72 bg-gradient-to-br from-primary/20 to-tier-nvidia/15 blob-morph blur-[80px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/5 w-80 h-80 bg-gradient-to-tr from-tier-nvidia/15 to-primary/20 blob-morph-slow blur-[90px] pointer-events-none" />
        {/* Floating particles */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full bg-primary/30 particle pointer-events-none" style={{ animationDelay: '0s' }} />
        <div className="absolute top-1/3 right-1/3 w-3 h-3 rounded-full bg-tier-nvidia/25 particle pointer-events-none" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-1/4 left-1/3 w-2 h-2 rounded-full bg-primary/25 particle pointer-events-none" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 right-1/4 w-2.5 h-2.5 rounded-full bg-tier-nvidia/20 particle pointer-events-none" style={{ animationDelay: '3s' }} />
        <div className="absolute bottom-1/3 right-1/2 w-2 h-2 rounded-full bg-primary/35 particle pointer-events-none" style={{ animationDelay: '4s' }} />

        <div className="container relative py-20 md:py-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-3xl"
          >
            {/* Live status pill */}
            <div className="inline-flex flex-wrap items-center gap-2 mb-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-surface-raised/80 backdrop-blur px-3.5 py-1.5 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-tier-nvidia opacity-60 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-tier-nvidia" />
                </span>
                <span className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-foreground/80 type-cursor">
                  Manthana‑Labs · Clinical AI · Live Beta
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">
                <UserCheck className="h-3.5 w-3.5" />
                Registered doctors only
              </span>
            </div>

            <h1 className="font-display text-balance text-5xl md:text-7xl lg:text-[5.25rem] font-medium leading-[1.0] tracking-tight text-foreground">
              The clinical AI{" "}
              <span className="bg-gradient-to-r from-primary via-primary-glow to-tier-nvidia bg-clip-text text-transparent">
                co‑pilot
              </span>{" "}
              built for the
              <span className="italic font-normal text-primary"> reading room</span>.
            </h1>

            <p className="mt-7 max-w-2xl text-pretty text-lg md:text-xl text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Manthana‑Labs</strong> reads 128 medical
              imaging modalities — chest X-rays to whole-slide pathology — drafts a structured
              ICD‑10 / SNOMED report in under a minute, then re-interprets it through Ayurveda,
              Homeopathy, Siddha, Unani or Allopathy with shloka-grade citations. Every report
              waits for your cryptographic sign‑off.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                onClick={goStudio}
                className="group relative overflow-hidden bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-7 text-base shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-primary/35 animate-pulse-glow magnetic-btn"
              >
                <span className="relative z-10">Open the studio</span>
                <ArrowRight className="ml-2 h-4 w-4 relative z-10 transition-transform group-hover:translate-x-1" />
                <span className="absolute inset-0 shimmer-multi opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/signup")}
                className="group h-12 px-6 text-base border-border bg-surface-raised/60 backdrop-blur hover:bg-primary/5 hover:border-primary/40 transition-all duration-300 relative overflow-hidden magnetic-btn"
              >
                <span className="relative z-10">Request clinician access</span>
                <span className="absolute inset-0 shimmer-multi opacity-0 group-hover:opacity-50 transition-opacity duration-300" />
              </Button>
              <InstallButton
                size="lg"
                variant="outline"
                label="Install app"
                className="group h-12 px-6 text-base border-primary/40 bg-surface-raised/60 backdrop-blur hover:bg-primary/10 transition-all duration-300 relative overflow-hidden magnetic-btn"
              >
                <span className="absolute inset-0 shimmer-multi opacity-0 group-hover:opacity-50 transition-opacity duration-300" />
              </InstallButton>
            </div>
            <p className="mt-3 text-xs text-muted-foreground/80 inline-flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              One-click install — works as a native app on Android, iPhone, iPad, Windows & macOS. No app store required.
            </p>

            <p className="mt-5 text-sm text-muted-foreground/90 inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>
                <strong className="text-foreground">3 emergency scans free for life</strong> on sign-up
                · daily fair-use AI chat · upgrade only when your practice grows.
              </span>
            </p>

            <p className="mt-3 text-sm inline-flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 max-w-xl">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-foreground/85">
                <strong className="text-foreground">For registered medical practitioners only.</strong>{" "}
                Access requires a valid council registration — Allopathy (MBBS/MD), Ayurveda (BAMS),
                Homeopathy (BHMS), Siddha (BSMS), Unani (BUMS), or Dental (BDS/MDS). Every signup
                is verified against the relevant council registry. <span className="text-muted-foreground">Not for patients or the general public.</span>
              </span>
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <TierBadge tier="A" size="lg" />
              <TierBadge tier="H" size="lg" />
              <span className="text-xs text-muted-foreground ml-1">
                Two workflows. Always clinician-reviewed.
              </span>
            </div>

            {/* Telemetry strip — futuristic feel */}
            <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
              {[
                { k: "128", l: "Modalities" },
                { k: "13", l: "Indian languages" },
                { k: "5", l: "Medical traditions" },
                { k: "<60s", l: "Median turnaround" },
              ].map((s, idx) => (
                <div
                  key={s.l}
                  className="group card-3d rounded-xl border border-border/70 bg-surface-raised/60 backdrop-blur px-3 py-2.5 hover:border-primary/50 hover:bg-surface-raised/80 hover:shadow-[0_0_25px_hsl(var(--primary)/0.15)] transition-all duration-300"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  <div className="font-display text-2xl tracking-tight text-foreground group-hover:text-primary transition-colors duration-300">{s.k}</div>
                  <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground mt-0.5 group-hover:text-muted-foreground/80 transition-colors duration-300">
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* GLOBAL-TIER ENDLESS WORKFLOW MARQUEE */}
      <div className="relative w-full py-7 overflow-hidden bg-surface-raised/35 border-y border-border/50 backdrop-blur-sm shadow-sm">
        {/* Absolute edge-fades */}
        <div className="absolute left-0 top-0 bottom-0 w-24 sm:w-48 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-24 sm:w-48 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
        
        <div className="flex whitespace-nowrap gap-6 animate-marquee">
          {/* First loop */}
          {MARQUEE_ITEMS.map((item, idx) => (
            <div 
              key={idx} 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/4 hover:bg-primary/8 hover:border-primary/45 transition-all duration-300 text-xs font-bold text-primary tracking-wider uppercase shadow-sm cursor-default"
            >
              <Activity className="h-3.5 w-3.5 animate-pulse text-primary-glow" />
              {item}
            </div>
          ))}
          {/* Second loop (mirror for infinite scroll) */}
          {MARQUEE_ITEMS.map((item, idx) => (
            <div 
              key={`mirror-${idx}`} 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/4 hover:bg-primary/8 hover:border-primary/45 transition-all duration-300 text-xs font-bold text-primary tracking-wider uppercase shadow-sm cursor-default"
            >
              <Activity className="h-3.5 w-3.5 animate-pulse text-primary-glow" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Accreditations & affiliations */}
      <motion.section
        className="container pt-4 pb-10"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="text-center max-w-2xl mx-auto mb-6">
          <div className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Accelerated by · Recognised by
          </div>
          <p className="mt-3 font-display text-lg md:text-xl text-foreground/90 italic">
            Built by a doctor, for the doctors of every tradition — with equal respect for
            Allopathy, Ayurveda, Homeopathy, Siddha &amp; Unani.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Award, eyebrow: "Government of India", title: "DPIIT Recognised", sub: "Certified Startup", accent: "primary" as const },
            { icon: Code2, eyebrow: "Engineering", title: "Google Developer", sub: "Premium Tier", accent: "primary" as const },
            { icon: ShieldCheck, eyebrow: "Compliance", title: "DPDP-Aligned", sub: "Privacy by Design", accent: "primary" as const },
            { icon: HeartPulse, eyebrow: "Built for", title: "Indian Clinicians", sub: "Allopathy + AYUSH", accent: "primary" as const },
          ].map((item, idx) => (
            <div
              key={item.title}
              className="group card-3d surface-clinical p-4 md:p-5 flex flex-col items-start hover:translate-y-[-4px] hover:border-primary/50 hover:shadow-[0_0_30px_hsl(var(--primary)/0.18)] transition-all duration-300 relative overflow-hidden"
              style={{ animationDelay: `${idx * 0.15}s` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="h-10 w-10 rounded-lg flex items-center justify-center mb-3 bg-primary/10 text-primary transition-colors group-hover:bg-primary/20 icon-bounce">
                <item.icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" strokeWidth={2.2} />
              </div>
              <div className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors group-hover:text-muted-foreground/80 relative z-10">
                {item.eyebrow}
              </div>
              <div className="font-display text-base md:text-lg tracking-tight mt-0.5 leading-tight transition-colors group-hover:text-primary relative z-10">
                {item.title}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 relative z-10">
                <BadgeCheck className="h-3 w-3 text-primary animate-pulse" />
                {item.sub}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[0.7rem] text-muted-foreground/70 text-center max-w-2xl mx-auto">
          Programme affiliations &amp; recognitions of Quaasx 108 Private Limited. All trademarks belong to
          their respective owners.
        </p>
      </motion.section>

      {/* Trust strip */}
      <motion.section
        className="container pb-16"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {[
            {
              icon: ShieldCheck,
              title: "Standard workflow",
              body: "Upload imaging studies — chest X-rays, CT, MRI, US, pathology, ECG. AI-assisted draft, clinician-reviewed.",
              tone: "nvidia" as const,
            },
            {
              icon: Sparkles,
              title: "Live capture",
              body: "Real-time bedside exams from your phone camera. 13 specialties, results in seconds.",
              tone: "research" as const,
            },
            {
              icon: Lock,
              title: "DPDP-aligned",
              body: "PHI minimization, audit trails, TOTP 2FA, and explicit attestation on every login.",
              tone: "neutral" as const,
            },
          ].map((card, idx) => (
            <div
              key={card.title}
              className="group card-3d surface-clinical p-5 md:p-6 hover:translate-y-[-4px] hover:border-primary/50 hover:shadow-[0_0_30px_hsl(var(--primary)/0.18)] transition-all duration-300 relative overflow-hidden"
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div
                className={
                  "h-9 w-9 rounded-lg flex items-center justify-center mb-3 transition-colors icon-bounce relative z-10 " +
                  (card.tone === "nvidia"
                    ? "bg-tier-nvidia-soft text-tier-nvidia-foreground group-hover:bg-tier-nvidia/25"
                    : card.tone === "research"
                    ? "bg-tier-research-soft text-tier-research-foreground group-hover:bg-tier-research/25"
                    : "bg-accent text-accent-foreground group-hover:bg-primary/20")
                }
              >
                <card.icon className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" strokeWidth={2.4} />
              </div>
              <div className="font-display text-xl tracking-tight transition-colors group-hover:text-primary relative z-10">{card.title}</div>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed group-hover:text-muted-foreground/90 relative z-10">{card.body}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Trust & Compliance — security guarantees */}
      <motion.section
        className="container pb-20"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="rounded-xl border-glow-rotate p-[1px]">
          <div className="surface-clinical relative overflow-hidden p-6 md:p-10 rounded-xl">
            <div className="absolute -top-24 -left-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-tier-nvidia/10 blur-3xl pointer-events-none" />
          {/* Floating particles */}
          <div className="absolute top-1/4 left-1/5 w-2 h-2 rounded-full bg-primary/25 particle pointer-events-none" style={{ animationDelay: '0.5s' }} />
          <div className="absolute top-1/2 right-1/4 w-2.5 h-2.5 rounded-full bg-tier-nvidia/20 particle pointer-events-none" style={{ animationDelay: '1.5s' }} />
          <div className="absolute bottom-1/3 left-1/4 w-2 h-2 rounded-full bg-primary/30 particle pointer-events-none" style={{ animationDelay: '2.5s' }} />

          <div className="relative max-w-2xl">
            <div className="inline-flex items-center gap-2 text-[0.7rem] font-medium uppercase tracking-[0.22em] text-muted-foreground mb-3">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Trust &amp; compliance
            </div>
            <h2 className="font-display text-3xl md:text-5xl tracking-tight">
              Engineered for the <span className="italic text-primary">medico‑legal</span> bar.
            </h2>
            <p className="mt-3 text-muted-foreground text-lg">
              Manthana‑Labs is built so every byte is encrypted, every report is signed by a
              licensed clinician, and every action is permanently recorded — verifiable years
              later in a court of law.
            </p>
          </div>

          <div className="relative mt-8 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            {[
              {
                icon: Lock,
                eyebrow: "Encryption",
                title: "AES‑256 at rest · TLS 1.3 in transit",
                points: [
                  "PHI minimised before any AI call",
                  "Per-tenant isolation with row-level security",
                  "Logo & signature assets served over signed URLs",
                ],
              },
              {
                icon: FileSignature,
                eyebrow: "Clinician sign‑off",
                title: "Cryptographic SHA‑256 attestation",
                points: [
                  "No PDF leaves the studio without doctor lock",
                  "Report hash + signature stored on every study",
                  "Public verify URL on every signed report",
                ],
              },
              {
                icon: Fingerprint,
                eyebrow: "Audit trail",
                title: "Immutable, append‑only ledger",
                points: [
                  "Original AI draft + every doctor edit preserved",
                  "Login, view, edit, sign, export — all timestamped",
                  "DPDP-aligned retention &amp; export on request",
                ],
              },
            ].map((card, idx) => (
              <div
                key={card.eyebrow}
                className="group card-3d rounded-xl border border-border bg-surface p-5 hover:border-primary/50 hover:translate-y-[-2px] hover:shadow-[0_0_30px_hsl(var(--primary)/0.15)] transition-all duration-300 relative overflow-hidden"
                style={{ animationDelay: `${idx * 0.1}s` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="h-10 w-10 rounded-lg flex items-center justify-center mb-3 bg-primary/10 text-primary icon-bounce relative z-10">
                  <card.icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" strokeWidth={2.2} />
                </div>
                <div className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground relative z-10">
                  {card.eyebrow}
                </div>
                <div className="font-display text-lg tracking-tight mt-0.5 leading-tight transition-colors group-hover:text-primary relative z-10">
                  {card.title}
                </div>
                <ul className="mt-3 space-y-1.5 relative z-10">
                  {card.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed group-hover:text-muted-foreground/90 transition-colors">
                      <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="relative mt-6 flex flex-wrap items-center gap-2">
            {[
              { icon: ShieldCheck, label: "DPDP-aligned" },
              { icon: KeyRound, label: "TOTP 2FA" },
              { icon: BadgeCheck, label: "Council-verified clinicians" },
              { icon: Clock, label: "7-year audit retention" },
            ].map((b) => (
              <span
                key={b.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-3 py-1 text-[0.7rem] text-muted-foreground"
              >
                <b.icon className="h-3 w-3 text-primary" />
                {b.label}
              </span>
            ))}
          </div>
        </div>
        </div>
      </motion.section>

      {/* AYUSH + Allopathy band */}
      <motion.section
        className="container pb-20"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="rounded-xl border-glow-rotate p-[1px]">
          <div className="surface-clinical p-6 md:p-10 relative overflow-hidden rounded-xl">
            <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            {/* Floating particles */}
            <div className="absolute top-1/3 left-1/4 w-2 h-2 rounded-full bg-primary/25 particle pointer-events-none" style={{ animationDelay: '0.3s' }} />
            <div className="absolute top-1/2 right-1/3 w-2.5 h-2.5 rounded-full bg-tier-nvidia/20 particle pointer-events-none" style={{ animationDelay: '1.3s' }} />
            <div className="absolute bottom-1/4 left-1/3 w-2 h-2 rounded-full bg-primary/30 particle pointer-events-none" style={{ animationDelay: '2.3s' }} />
          <div className="relative max-w-2xl">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground mb-3">
              First in India
            </div>
            <h2 className="font-display text-3xl md:text-5xl tracking-tight">
              One report. Five medical traditions.
            </h2>
            <p className="mt-3 text-muted-foreground text-lg">
              After every report, switch the lens. Manthana‑Labs re-interprets the same imaging
              findings through your discipline — with verifiable citations from classical texts
              and modern guidelines. No hand-waving, no invented verses.
            </p>
          </div>

          <div className="relative mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {DOMAINS.map((d, idx) => (
              <div
                key={d.id}
                className="group card-3d rounded-xl border border-border bg-surface p-4 hover:border-primary/50 hover:shadow-[0_0_25px_hsl(var(--primary)/0.15)] transition-all duration-300 relative overflow-hidden"
                style={{ animationDelay: `${idx * 0.08}s` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="flex items-center gap-2 mb-2 relative z-10">
                  <span className="text-2xl animate-float" aria-hidden style={{ animationDelay: `${idx * 0.2}s` }}>{d.emoji}</span>
                  <span className="font-display text-base tracking-tight transition-colors group-hover:text-primary">{d.label}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed group-hover:text-muted-foreground/90 transition-colors relative z-10">{d.blurb}</p>
              </div>
            ))}
          </div>

          <div className="relative mt-6 text-xs text-muted-foreground italic flex items-start gap-2">
            <BookMarked className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Citations grounded in Charaka, Sushruta, Ashtanga Hridaya, Bhavaprakasha, Hahnemann's
              Organon, Boericke, Kent, Agathiyar, Theraiyar, Al-Qanun, Kitab al-Hawi — and ACR /
              RSNA / NICE for modern medicine. Verses kept in original script with translation.
            </span>
          </div>
        </div>
        </div>
      </motion.section>

      {/* Language strip */}
      <motion.section
        className="container pb-20"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 mb-6">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground mb-2">
              <Languages className="h-3 w-3 inline mr-1.5 -mt-0.5" />
              For every Indian patient
            </div>
            <h2 className="font-display text-3xl md:text-5xl tracking-tight">
              Translate any report,<br className="hidden md:block" /> in their mother tongue.
            </h2>
          </div>
          <p className="text-muted-foreground max-w-md text-pretty">
            Faithful one-tap translation. ICD-10 codes, units and severity tags stay intact —
            so the WhatsApp message a son receives in Mumbai matches the report his mother
            holds in Madurai.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l, idx) => (
            <div
              key={l.code}
              className="group card-3d rounded-full border border-border bg-surface-raised px-3.5 py-1.5 text-sm flex items-center gap-2 hover:border-primary/50 hover:shadow-[0_0_20px_hsl(var(--primary)/0.15)] transition-all duration-300 relative overflow-hidden"
              style={{ animationDelay: `${idx * 0.03}s` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <span className="text-muted-foreground text-xs uppercase tracking-wider group-hover:text-primary transition-colors relative z-10">{l.label}</span>
              <span className="font-medium group-hover:text-primary transition-colors relative z-10">{l.native}</span>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Master feature grid */}
      <motion.section
        className="container pb-20"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="max-w-2xl mb-10">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Inside the studio
          </div>
          <h2 className="font-display text-3xl md:text-5xl tracking-tight">
            Built like clinicians actually work.
          </h2>
          <p className="mt-3 text-muted-foreground text-lg">
            Every workflow shipped as a first-class feature — not a checkbox.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              icon: Eye,
              title: "Built-in image viewer",
              body: "Pan / zoom / window-level, side-by-side comparison, ROI tools and cine playback on uploaded photos and clips.",
            },
            {
              icon: MessageSquare,
              title: "Domain-aware AI chat",
              body: "Re-read every report through Allopathy, Ayurveda, Homeopathy, Siddha or Unani — with shloka-grade citations.",
            },
            {
              icon: Languages,
              title: "13 Indian languages",
              body: "Patient summary + full report translated, faithful to medical codes and units.",
            },
            {
              icon: Search,
              title: "ICD-10 + SNOMED picker",
              body: "Debounced search-and-select on a curated code library — no more guessing strings.",
            },
            {
              icon: ListChecks,
              title: "Differential diagnosis panel",
              body: "Ranked alternatives with supporting / opposing features and likelihood bars.",
            },
            {
              icon: AlertTriangle,
              title: "Urgency escalation gate",
              body: "URGENT / STAT findings demand acknowledgement, callback target & note before export.",
            },
            {
              icon: Heart,
              title: "Plain-language patient summary",
              body: "AI-generated 8th-grade reading level — copy straight to WhatsApp.",
            },
            {
              icon: FileSignature,
              title: "Cryptographic sign-off",
              body: "SHA-256 report hash + signature stored in tamper-evident audit log.",
            },
            {
              icon: KeyRound,
              title: "TOTP 2-factor auth",
              body: "Authenticator-app enrollment with AAL2 step-up before any clinical UI.",
            },
            {
              icon: Fingerprint,
              title: "Multi-council verification",
              body: "NMC, NCISM (Ayurveda/Siddha/Unani), NCH (Homeopathy), DCI — all supported.",
            },
            {
              icon: GitCompare,
              title: "Prior vs current comparison",
              body: "Side-by-side comparison viewer for follow-up studies.",
            },
            {
              icon: FileJson,
              title: "Structured JSON export",
              body: "Machine-readable report payload for EHR handoff. PDF watermarked with reviewer name.",
            },
            {
              icon: Boxes,
              title: "128 modalities",
              body: "X-ray, CT, MRI, US, ECG, pathology, photo & video — auto-detected on upload.",
            },
            {
              icon: Volume2,
              title: "Idle-lock + audit log",
              body: "Auto-lock after 15 min of inactivity. Every action stamped to a server audit trail.",
            },
            {
              icon: Lock,
              title: "DPDP-aligned by default",
              body: "PHI minimization, RLS on every table, signed report integrity, attestation on each login.",
            },
          ].map((f, idx) => (
            <div
              key={f.title}
              className="group card-3d rounded-xl border border-border bg-surface-raised p-5 hover:border-primary/50 hover:shadow-[0_0_25px_hsl(var(--primary)/0.15)] transition-all duration-300 relative overflow-hidden"
              style={{ animationDelay: `${idx * 0.05}s` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3 icon-bounce relative z-10">
                <f.icon className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" strokeWidth={2.2} />
              </div>
              <div className="font-display text-base tracking-tight transition-colors group-hover:text-primary relative z-10">{f.title}</div>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed group-hover:text-muted-foreground/90 transition-colors relative z-10">{f.body}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Workflow */}
      <motion.section
        className="container pb-24"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="max-w-2xl mb-10">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground mb-3">
            The workflow
          </div>
          <h2 className="font-display text-3xl md:text-5xl tracking-tight">
            Eight steps. One signature.
          </h2>
          <p className="mt-3 text-muted-foreground text-lg">
            Upload a study, answer a brief questionnaire, review the AI&rsquo;s draft, and sign off.
            Nothing leaves your hands without your impression.
          </p>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { n: "01", t: "Auto-detect", b: "Upload — we identify the modality.", i: Layers },
            { n: "02", t: "Confirm", b: "Tier disclosed before analysis begins.", i: ShieldCheck },
            { n: "03", t: "Brief", b: "4–8 questions in chat-style cards.", i: Activity },
            { n: "04", t: "Analyze", b: "Streaming progress over WebSocket.", i: Sparkles },
            { n: "05", t: "Review", b: "Findings, severity, confidence, codes.", i: Stethoscope },
            { n: "06", t: "Sign", b: "SHA-256 cryptographic sign-off.", i: FileSignature },
            { n: "07", t: "Deliver", b: "Watermarked PDF + WhatsApp.", i: ArrowRight },
            { n: "08", t: "Discuss", b: "Domain chat in any Indian language.", i: MessageSquare },
          ].map((s, idx) => (
            <li
              key={s.n}
              className="group card-3d rounded-xl border border-border bg-surface-raised p-5 hover:border-primary/50 hover:shadow-[0_0_25px_hsl(var(--primary)/0.15)] transition-all duration-300 relative overflow-hidden"
              style={{ animationDelay: `${idx * 0.08}s` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="flex items-center justify-between mb-3 relative z-10">
                <span className="font-mono text-[0.7rem] text-muted-foreground group-hover:text-primary transition-colors">{s.n}</span>
                <s.i className="h-4 w-4 text-primary/70 icon-bounce" strokeWidth={2.2} />
              </div>
              <div className="font-display text-lg tracking-tight transition-colors group-hover:text-primary relative z-10">{s.t}</div>
              <p className="mt-1 text-sm text-muted-foreground group-hover:text-muted-foreground/90 transition-colors relative z-10">{s.b}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12 rounded-xl border-glow-rotate p-[1px]">
          <div className="surface-clinical p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-xl">
          <div>
            <div className="font-display text-2xl tracking-tight">Ready to try the studio?</div>
            <p className="mt-1 text-muted-foreground">
              Upload a study, answer the modality questionnaire, and review the AI-assisted report.
            </p>
          </div>
          <Button size="lg" onClick={goStudio} className="bg-primary hover:bg-primary/90">
            Enter the studio <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
        </div>
      </motion.section>

      {/* Pricing teaser */}
      <motion.section
        className="container pb-20"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="max-w-2xl mb-8">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Pricing
          </div>
          <h2 className="font-display text-3xl md:text-5xl tracking-tight">
            Built for a doctor's wallet.
          </h2>
          <p className="mt-3 text-muted-foreground text-lg">
            Free for life on emergency scans. Pro plans starting at ₹299/mo. Sponsored
            access for verified free camps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { code: "free", icon: Sparkles, name: "Free", price: "₹0", line: "3 emergency scans for life + 2 auto-grant on request", sub: "2 chat messages per report" },
            { code: "pro", icon: Zap, name: "Pro", price: "₹299/mo", line: "50 monthly + 1/day add-on (~80 scans)", sub: "10 chat messages per report" },
            { code: "pro_plus", icon: Crown, name: "Pro+", price: "₹599/mo", line: "100 monthly + 2/day (~160 scans) · Priority queue", sub: "20 chat messages per report", featured: true },
            { code: "enterprise", icon: HeartPulse, name: "Enterprise", price: "Custom", line: "Custom volume, SLA, on-prem option", sub: "Contact info@quaasx108.com" },
          ].map((p, idx) => (
            <div
              key={p.code}
              className={
                "group card-3d rounded-xl border p-5 bg-surface flex flex-col relative overflow-hidden transition-all duration-300 " +
                (p.featured 
                  ? "border-primary ring-1 ring-primary/30 shadow-md hover:shadow-[0_0_35px_hsl(var(--primary)/0.25)] hover:border-primary/60" 
                  : "border-border hover:border-primary/50 hover:shadow-[0_0_25px_hsl(var(--primary)/0.15)]")
              }
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3 icon-bounce relative z-10">
                <p.icon className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" />
              </div>
              <div className="font-display text-lg tracking-tight transition-colors group-hover:text-primary relative z-10">{p.name}</div>
              <div className="font-display text-2xl mt-1 transition-colors group-hover:text-primary relative z-10">{p.price}</div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed group-hover:text-muted-foreground/90 transition-colors relative z-10">{p.line}</p>
              <p className="text-[0.7rem] text-muted-foreground/80 mt-1 relative z-10">{p.sub}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/pricing">
            <Button className="bg-primary hover:bg-primary/90">
              See full pricing &amp; camp programme <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <a href="mailto:info@quaasx108.com?subject=Enterprise%20enquiry">
            <Button variant="outline">
              <Mail className="h-4 w-4 mr-2" />
              Talk to sales
            </Button>
          </a>
        </div>
      </motion.section>

      {/* GPU fair-use notice */}
      <motion.section
        className="container pb-20"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="rounded-xl border-glow-rotate p-[1px]">
          <div className="surface-clinical p-5 md:p-6 flex flex-col md:flex-row items-start gap-4 rounded-xl">
          <Clock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-foreground">A note on GPU processing time</div>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              Manthana‑Labs runs on shared GPU clusters. Most studies return in under a minute, but during
              peak load your scan may briefly join a queue. Please reserve
              <strong className="text-foreground"> urgent / emergency scans</strong> for genuine
              clinical need — using them for routine work means a real patient elsewhere has to wait
              longer. Pro+ subscribers always jump to the priority queue.
            </p>
          </div>
        </div>
        </div>
      </motion.section>

      {/* Camp programme */}
      <motion.section
        className="container pb-20"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="rounded-xl border-glow-rotate p-[1px]">
          <div className="surface-clinical p-6 md:p-10 relative overflow-hidden rounded-xl">
            <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            {/* Floating particles */}
            <div className="absolute top-1/4 left-1/5 w-2 h-2 rounded-full bg-primary/25 particle pointer-events-none" style={{ animationDelay: '0.4s' }} />
            <div className="absolute top-1/2 right-1/4 w-2.5 h-2.5 rounded-full bg-tier-nvidia/20 particle pointer-events-none" style={{ animationDelay: '1.4s' }} />
            <div className="absolute bottom-1/3 left-1/3 w-2 h-2 rounded-full bg-primary/30 particle pointer-events-none" style={{ animationDelay: '2.4s' }} />
          <div className="relative max-w-2xl">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground mb-3 inline-flex items-center gap-1.5">
              <Tent className="h-3 w-3" /> Free Camp Programme
            </div>
            <h2 className="font-display text-3xl md:text-4xl tracking-tight">
              Hosting a free medical camp? We'll help you carry the load.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Verified clinics (with both doctor &amp; clinic registration) and recognised
              medical-education institutions can apply for
              <strong className="text-foreground"> 50–70% concession</strong> — sometimes
              <strong className="text-foreground"> fully sponsored access up to 1,000 scans / month</strong> —
              decided case-by-case by our evaluating team.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/pricing">
                <Button className="bg-primary hover:bg-primary/90">
                  Apply for camp programme
                </Button>
              </Link>
              <a href="mailto:info@quaasx108.com?subject=Free%20camp%20programme%20enquiry">
                <Button variant="outline">
                  <Mail className="h-4 w-4 mr-2" />
                  info@quaasx108.com
                </Button>
              </a>
            </div>
          </div>
        </div>
        </div>
      </motion.section>

      {/* Eligibility — Who can sign up */}
      <motion.section
        className="container pb-12"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="rounded-xl border-glow-rotate p-[1px]">
          <div className="surface-clinical p-6 md:p-10 relative overflow-hidden rounded-xl">
            <div className="absolute -top-20 -right-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            {/* Floating particles */}
            <div className="absolute top-1/4 left-1/5 w-2 h-2 rounded-full bg-primary/25 particle pointer-events-none" style={{ animationDelay: '0.6s' }} />
            <div className="absolute top-1/2 right-1/4 w-2.5 h-2.5 rounded-full bg-tier-nvidia/20 particle pointer-events-none" style={{ animationDelay: '1.6s' }} />
            <div className="absolute bottom-1/3 left-1/3 w-2 h-2 rounded-full bg-primary/30 particle pointer-events-none" style={{ animationDelay: '2.6s' }} />
          <div className="relative grid gap-8 md:grid-cols-[1.1fr_1fr]">
            <div>
              <div className="inline-flex items-center gap-2 text-[0.7rem] font-medium uppercase tracking-[0.22em] text-muted-foreground mb-3">
                <UserCheck className="h-3.5 w-3.5 text-primary" />
                Eligibility
              </div>
              <h2 className="font-display text-3xl md:text-5xl tracking-tight">
                A platform <span className="italic text-primary">strictly</span> for registered doctors.
              </h2>
              <p className="mt-3 text-muted-foreground text-lg">
                Manthana‑Labs is a clinical decision-support tool. Access is restricted to licensed
                medical practitioners across every recognised system of medicine in India. Every
                signup is checked against the relevant council registry before the studio unlocks —
                no exceptions, no guest accounts, no patient logins.
              </p>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  "Allopathy — MBBS, MD, MS, DM, MCh (NMC / State Medical Council)",
                  "Ayurveda — BAMS, MD (Ayu) (CCIM / NCISM)",
                  "Homeopathy — BHMS, MD (Hom) (CCH / NCH)",
                  "Siddha — BSMS, MD (Siddha) (NCISM)",
                  "Unani — BUMS, MD (Unani) (NCISM)",
                  "Dental — BDS, MDS (Dental Council of India)",
                ].map((line) => (
                  <div
                    key={line}
                    className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    <BadgeCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    <span className="text-sm text-foreground/85">{line}</span>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-xs text-muted-foreground">
                Final-year interns, PG residents and government health officers may apply with a
                supervising clinician's attestation — reviewed case‑by‑case.
              </p>
            </div>

            <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-5 md:p-6 self-start">
              <div className="inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-destructive">
                <Ban className="h-3.5 w-3.5" />
                Not for the general public
              </div>
              <h3 className="font-display text-xl tracking-tight mt-3">
                Please don't sign up if you are…
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-foreground/85">
                {[
                  "A patient looking for a second opinion on your own scans",
                  "A family member of a patient seeking a diagnosis",
                  "A non-clinical student, researcher, or curious user",
                  "A clinic staff member without a personal council registration",
                ].map((p) => (
                  <li key={p} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                Manthana‑Labs does <strong className="text-foreground">not</strong> provide direct‑to‑patient
                diagnosis. Reports are only valid when reviewed and cryptographically signed by a
                registered clinician. If you are a patient, please consult your treating doctor —
                they can use Manthana‑Labs on your behalf.
              </p>
            </div>
          </div>
        </div>
        </div>
      </motion.section>

      {/* Identity-misuse caution */}
      <motion.section
        className="container pb-20"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="rounded-xl border border-warn/30 bg-warn-soft/40 p-5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warn-foreground mt-0.5 shrink-0" />
          <div className="text-sm text-warn-foreground/90">
            <div className="font-medium">A gentle but firm note on identity</div>
            <p className="mt-1">
              We allow minor mismatches in name spelling or transliteration during council verification —
              we trust clinicians to use Manthana‑Labs fairly. Misusing another doctor's registration number
              or otherwise faking identity is a direct violation of our terms; legal and professional
              consequences (including council action) rest entirely with the individual who attempted
              it. Please use Manthana‑Labs with the same integrity you bring to your patients.
            </p>
          </div>
        </div>
      </motion.section>

      <footer className="border-t border-border/70">
        <div className="container py-8 grid gap-4 md:grid-cols-3 text-xs text-muted-foreground">
          <div className="space-y-1">
            <div className="text-foreground font-medium">Manthana‑Labs</div>
            <div>A product of <span className="font-medium text-foreground">Quaasx 108 Private Limited</span></div>
            <div>Bengaluru, India · © {new Date().getFullYear()}</div>
          </div>
          <div className="space-y-1">
            <div className="text-foreground font-medium">Contact</div>
            <a href="mailto:info@quaasx108.com" className="hover:text-foreground transition block">
              info@quaasx108.com
            </a>
            <div className="text-muted-foreground/80">
              For registered clinician access, partnerships &amp; support. Patient enquiries are not accepted.
            </div>
            <div className="pt-1.5 border-t border-border/40 mt-1.5">
              <span className="text-foreground/90 font-medium">Clinical Lead:</span> Dr. M.D. Samudri
            </div>
          </div>
          <div className="space-y-1 md:text-right">
            <div className="text-foreground font-medium">More</div>
            <div className="flex md:justify-end gap-4">
              <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
              <a className="hover:text-foreground" href="#">Privacy</a>
              <a className="hover:text-foreground" href="#">DPDP</a>
              <a className="hover:text-foreground" href="#">Disclaimer</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
