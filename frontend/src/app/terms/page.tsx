import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read the terms that apply when using Splitvero to calculate and manage shared expenses.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Terms of Service | Splitvero",
    description:
      "Read the terms that apply when using Splitvero to calculate and manage shared expenses.",
    url: "/terms",
  },
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background text-foreground py-20 px-4 md:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-4xl font-extrabold tracking-tight">Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: June 18, 2026</p>

        <div className="space-y-6 text-lg">
          <section>
            <h2 className="text-2xl font-bold mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using Splitvero, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, then you may not access the service.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">2. Use of the Service</h2>
            <p>Splitvero provides a tool for calculating shared expenses. You agree to use the service only for lawful purposes and in accordance with these Terms.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">3. Disclaimer of Warranties</h2>
            <p>The service is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. We make no warranties, expressed or implied, regarding the accuracy of calculations or availability of the service.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">4. Limitation of Liability</h2>
            <p>In no event shall Splitvero be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or relating to your use of the service.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">5. Changes to Terms</h2>
            <p>We reserve the right to modify or replace these Terms at any time. We will try to provide at least 30 days&apos; notice prior to any new terms taking effect.</p>
          </section>
        </div>

        <div className="pt-12">
          <Link href="/" className="text-primary font-semibold hover:underline">&larr; Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
