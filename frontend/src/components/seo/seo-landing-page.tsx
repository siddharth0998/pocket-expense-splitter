import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { SeoLandingPage } from "@/lib/seo-landing-pages";
import { seoLandingPages } from "@/lib/seo-landing-pages";

type SeoLandingPageProps = {
  page: SeoLandingPage;
};

const SITE_URL = "https://splitvero.com";

export function SeoLandingPageTemplate({ page }: SeoLandingPageProps) {
  const relatedPages = seoLandingPages.filter((item) => item.slug !== page.slug).slice(0, 3);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${SITE_URL}${page.path}#webpage`,
        url: `${SITE_URL}${page.path}`,
        name: page.title,
        description: page.description,
        isPartOf: {
          "@id": `${SITE_URL}/#webapp`,
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${SITE_URL}${page.path}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: SITE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: page.title,
            item: `${SITE_URL}${page.path}`,
          },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}${page.path}#faq`,
        mainEntity: page.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <main className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border bg-card/70">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <Link href="/" className="font-bold text-lg">
              Splitvero
            </Link>
            <Link href="/" className="text-sm font-semibold text-primary hover:underline">
              Open app
            </Link>
          </div>
        </header>

        <section className="px-4 py-16 md:py-20">
          <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-start">
            <div className="space-y-6">
              <p className="text-sm font-bold uppercase tracking-widest text-primary">
                {page.eyebrow}
              </p>
              <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
                {page.h1}
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                {page.intro}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  {page.primaryCta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/#faq"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card px-6 text-sm font-bold text-foreground transition-colors hover:bg-secondary"
                >
                  Read FAQ
                </Link>
              </div>
            </div>

            <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-bold">What you can do</h2>
              <div className="mt-5 space-y-4">
                {page.highlights.map((highlight) => (
                  <div key={highlight} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <p className="text-sm leading-6 text-muted-foreground">{highlight}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-secondary/25 px-4 py-16">
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            {page.sections.map((section) => (
              <article key={section.heading} className="rounded-[1.5rem] border border-border bg-card p-6">
                <h2 className="text-xl font-bold">{section.heading}</h2>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">{section.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[0.85fr_1.15fr]">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight">How it works</h2>
              <p className="mt-4 text-muted-foreground">
                A simple flow for turning shared costs into clear balances.
              </p>
            </div>
            <ol className="space-y-4">
              {page.steps.map((step, index) => (
                <li key={step} className="flex gap-4 rounded-[1.5rem] border border-border bg-card p-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <p className="pt-1 text-muted-foreground">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-border bg-secondary/20 px-4 py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-extrabold tracking-tight">Common questions</h2>
            <div className="mt-8 divide-y divide-border rounded-[1.5rem] border border-border bg-card">
              {page.faqs.map((faq) => (
                <details key={faq.question} className="group p-5">
                  <summary className="cursor-pointer text-base font-bold marker:text-primary">
                    {faq.question}
                  </summary>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-extrabold tracking-tight">Related expense splitting pages</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {relatedPages.map((relatedPage) => (
                <Link
                  key={relatedPage.slug}
                  href={relatedPage.path}
                  className="rounded-[1.25rem] border border-border bg-card p-5 transition-colors hover:bg-secondary/60"
                >
                  <span className="text-base font-bold">{relatedPage.title}</span>
                  <span className="mt-2 block text-sm leading-6 text-muted-foreground">
                    {relatedPage.description}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
