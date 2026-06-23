import { SeoLandingPageTemplate } from "@/components/seo/seo-landing-page";
import { getSeoLandingPage, seoLandingPageMetadata } from "@/lib/seo-landing-pages";

const page = getSeoLandingPage("free-expense-splitter");

export const metadata = seoLandingPageMetadata(page);

export default function FreeExpenseSplitterPage() {
  return <SeoLandingPageTemplate page={page} />;
}
