import { Link } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { Seo } from "@/components/seo/Seo";

const Contact = () => (
  <div className="min-h-screen bg-gradient-paper">
    <Seo
      title="Contact — Manthana-Labs"
      description="Get in touch with the Manthana-Labs team at Quaasx 108 Private Limited for sales, support, partnerships, or press."
      path="/contact"
      jsonLd={{
        "@context": "https://schema.org",
        "@type": "ContactPage",
        url: "https://manthana.quaasx108.com/contact",
        publisher: {
          "@type": "Organization",
          name: "Quaasx 108 Private Limited",
          email: "hello@quaasx108.com",
        },
      }}
    />
    <header className="container flex h-16 items-center justify-between">
      <Link to="/" className="focus-ring rounded-md"><Logo /></Link>
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Back to home</Link>
    </header>
    <main className="container max-w-2xl py-10 md:py-16 prose prose-neutral dark:prose-invert">
      <h1 className="font-display text-4xl tracking-tight">Contact us</h1>
      <ul>
        <li><strong>General:</strong> <a href="mailto:hello@quaasx108.com">hello@quaasx108.com</a></li>
        <li><strong>Sales:</strong> <a href="mailto:sales@quaasx108.com">sales@quaasx108.com</a></li>
        <li><strong>Support:</strong> <a href="mailto:support@quaasx108.com">support@quaasx108.com</a></li>
        <li><strong>Press:</strong> <a href="mailto:press@quaasx108.com">press@quaasx108.com</a></li>
        <li><strong>Privacy:</strong> <a href="mailto:privacy@quaasx108.com">privacy@quaasx108.com</a></li>
      </ul>
      <p>Quaasx 108 Private Limited · India</p>
    </main>
  </div>
);

export default Contact;
