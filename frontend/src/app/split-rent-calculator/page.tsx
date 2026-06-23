import { SeoLandingPageTemplate } from "@/components/seo/seo-landing-page";
import { getSeoLandingPage, seoLandingPageMetadata } from "@/lib/seo-landing-pages";

const page = getSeoLandingPage("split-rent-calculator");

export const metadata = seoLandingPageMetadata(page);

export default function SplitRentCalculatorPage() {
  return <SeoLandingPageTemplate page={page} />;
}
