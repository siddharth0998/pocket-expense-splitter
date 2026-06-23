import { SeoLandingPageTemplate } from "@/components/seo/seo-landing-page";
import { getSeoLandingPage, seoLandingPageMetadata } from "@/lib/seo-landing-pages";

const page = getSeoLandingPage("split-bills-with-friends");

export const metadata = seoLandingPageMetadata(page);

export default function SplitBillsWithFriendsPage() {
  return <SeoLandingPageTemplate page={page} />;
}
