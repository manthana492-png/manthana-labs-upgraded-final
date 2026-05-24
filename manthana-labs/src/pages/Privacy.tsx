import { Link } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { Seo } from "@/components/seo/Seo";

const Privacy = () => (
  <div className="min-h-screen bg-gradient-paper">
    <Seo
      title="Privacy Policy — Manthana-Labs"
      description="How Manthana-Labs by Quaasx 108 Private Limited handles patient images, clinician data, and analytics in compliance with Indian regulations."
      path="/privacy"
    />
    <header className="container flex h-16 items-center justify-between">
      <Link to="/" className="focus-ring rounded-md"><Logo /></Link>
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Back to home</Link>
    </header>
    <main className="container max-w-3xl py-10 md:py-16 prose prose-neutral dark:prose-invert">
      <h1 className="font-display text-4xl tracking-tight">Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: April 2026</p>

      <h2>1. Who we are</h2>
      <p>Manthana-Labs is operated by <strong>Quaasx 108 Private Limited</strong>, India. We provide an AI co-pilot for licensed clinicians.</p>

      <h2>2. What we collect</h2>
      <ul>
        <li>Account data: name, email, council registration, specialty.</li>
        <li>Clinical content you upload: images, video, questionnaire answers.</li>
        <li>Usage telemetry: page views and feature events via Google Analytics 4 (only after you consent).</li>
      </ul>

      <h2>3. How we use it</h2>
      <p>To run AI analysis, generate signed reports, support your account, and improve the product. We do not sell personal data.</p>

      <h2>4. Cookies & analytics</h2>
      <p>We load Google Analytics (gtag.js) only after you click <em>Accept</em> on the cookie banner. You may revoke consent at any time from the banner footer link.</p>

      <h2>5. Data retention & security</h2>
      <p>Patient images are stored encrypted at rest. Doctors may delete studies from the worklist at any time.</p>

      <h2>6. Contact</h2>
      <p>Questions: <a href="mailto:privacy@quaasx108.com">privacy@quaasx108.com</a>.</p>
    </main>
  </div>
);

export default Privacy;
