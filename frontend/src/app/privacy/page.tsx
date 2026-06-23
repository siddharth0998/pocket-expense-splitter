import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Splitvero handles personal data for shared expense groups, receipts, and ledgers.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Privacy Policy | Splitvero",
    description:
      "Learn how Splitvero handles personal data for shared expense groups, receipts, and ledgers.",
    url: "/privacy",
  },
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground py-20 px-4 md:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-4xl font-extrabold tracking-tight">Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: June 18, 2026</p>

        <div className="space-y-6 text-lg">
          <section>
            <h2 className="text-2xl font-bold mb-3">1. Information We Collect</h2>
            <p>Splitvero ("we", "us", or "our") collects information you provide directly to us, such as when you create a group, add members, and record expenses. This includes names, expense descriptions, and amounts.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">2. How We Use Your Information</h2>
            <p>We use the information we collect to provide, maintain, and improve our services, particularly to calculate the optimal min-cash-flow settlements between group members.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">3. Data Sharing</h2>
            <p>We do not sell, trade, or otherwise transfer your personally identifiable information to outside parties. Your group ledgers are accessible to anyone with the unique group link.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">4. Security</h2>
            <p>We implement a variety of security measures to maintain the safety of your personal information when you enter, submit, or access your personal information.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">5. Contact Us</h2>
            <p>If there are any questions regarding this privacy policy, you may contact us using the information on our main page.</p>
          </section>
        </div>

        <div className="pt-12">
          <Link href="/" className="text-primary font-semibold hover:underline">&larr; Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
