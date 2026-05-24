import { Link } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { Seo } from "@/components/seo/Seo";

const About = () => (
  <div className="min-h-screen bg-gradient-paper">
    <Seo
      title="About Manthana-Labs — Clinical AI by Quaasx 108"
      description="Manthana-Labs is built by Quaasx 108 Private Limited to give Indian clinicians a fast, honest, multi-modality AI co-pilot across Allopathy and AYUSH."
      path="/about"
      jsonLd={{
        "@context": "https://schema.org",
        "@type": "AboutPage",
        name: "About Manthana-Labs",
        url: "https://manthana.quaasx108.com/about",
        publisher: {
          "@type": "Organization",
          name: "Quaasx 108 Private Limited",
          url: "https://manthana.quaasx108.com/",
        },
      }}
    />
    <header className="container flex h-16 items-center justify-between">
      <Link to="/" className="focus-ring rounded-md"><Logo /></Link>
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Back to home</Link>
    </header>
    <main className="container max-w-3xl py-10 md:py-16 prose prose-neutral dark:prose-invert">
      <h1 className="font-display text-4xl tracking-tight">About Manthana-Labs</h1>
      <p>
        Manthana-Labs is a clinical AI imaging co-pilot built for licensed clinicians in India.
        We support 128 medical imaging modalities across Allopathy and AYUSH, including
        multi-modality and longitudinal comparison studies.
      </p>
      <h2>Our mission</h2>
      <p>
        Give every doctor — from a tier-3 town to a metro hospital — a tireless, honest second
        opinion. AI handles the pattern-matching; the doctor stays in charge.
      </p>
      <h2>Built by Quaasx 108</h2>
      <p>
        Quaasx 108 Private Limited is an Indian deep-tech company focused on clinical AI,
        privacy-first infrastructure, and responsible deployment.
      </p>
    </main>
  </div>
);

export default About;
