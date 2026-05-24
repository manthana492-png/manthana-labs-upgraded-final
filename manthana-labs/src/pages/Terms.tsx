import { Link } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { Seo } from "@/components/seo/Seo";

const Terms = () => (
  <div className="min-h-screen bg-gradient-paper">
    <Seo
      title="Terms of Service — Manthana-Labs"
      description="Terms of use for Manthana-Labs clinical AI co-pilot. Licensed clinicians only. AI is decision-support, not a replacement for clinical judgement."
      path="/terms"
    />
    <header className="container flex h-16 items-center justify-between">
      <Link to="/" className="focus-ring rounded-md"><Logo /></Link>
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Back to home</Link>
    </header>
    <main className="container max-w-3xl py-10 md:py-16 prose prose-neutral dark:prose-invert">
      <h1 className="font-display text-4xl tracking-tight">Terms of Service</h1>
      <p className="text-muted-foreground">Last updated: April 2026</p>

      <h2>1. Eligibility</h2>
      <p>Manthana-Labs is for <strong>licensed clinicians</strong> registered with NMC, NCISM, NCH, or DCI in India. Misrepresentation is grounds for immediate termination.</p>

      <h2>2. Clinical disclaimer</h2>
      <p>AI outputs are <strong>decision-support only</strong>. The treating clinician is solely responsible for diagnosis and treatment.</p>

      <h2>3. Acceptable use</h2>
      <p>No patient data without lawful basis. No use for illegal medical practice. Emergency-scan pool is reserved for genuine clinical urgency.</p>

      <h2>4. Billing</h2>
      <p>Subscriptions are billed in INR through Razorpay. Refunds follow our published refund policy.</p>

      <h2>5. Liability</h2>
      <p>To the maximum extent permitted by law, Quaasx 108 Private Limited is not liable for indirect or consequential damages.</p>

      <h2>6. Contact</h2>
      <p><a href="mailto:legal@quaasx108.com">legal@quaasx108.com</a></p>
    </main>
  </div>
);

export default Terms;
