import { SeoLandingPageTemplate } from "@/components/seo/seo-landing-page";
import { getSeoLandingPage, seoLandingPageMetadata } from "@/lib/seo-landing-pages";

const page = getSeoLandingPage("trip-expense-splitter");

export const metadata = seoLandingPageMetadata(page);

export default function TripExpenseSplitterPage() {
  return <SeoLandingPageTemplate page={page} />;
}
