import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const siteUrl = "https://splitvero.com";
const siteTitle = "Free Expense Splitter for Friends and Roommates | Splitvero";
const siteDescription =
  "Splitvero helps friends, roommates, and travel groups split bills, track shared expenses, upload receipts, and settle up with fewer payments.";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // Allows zooming for accessibility but fits mobile screens
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Splitvero",
  title: {
    default: siteTitle,
    template: "%s | Splitvero",
  },
  description: siteDescription,
  keywords: [
    "expense splitter",
    "free expense splitter",
    "split bills",
    "bill splitter",
    "roommate expenses",
    "trip expense splitter",
    "shared expenses",
    "settle up app",
  ],
  authors: [{ name: "Splitvero Team" }],
  creator: "Splitvero",
  publisher: "Splitvero",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: siteTitle,
    description: siteDescription,
    siteName: "Splitvero",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Splitvero expense splitter preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  appleWebApp: {
    capable: true,
    title: "Splitvero",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false, // Prevents iOS from turning random numbers into phone links
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head />
      <body className="min-h-full flex flex-col">
        <Script
          strategy="afterInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=G-JEDHRZD2NG"
        />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
        >
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-JEDHRZD2NG');
          `}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://splitvero.com/#organization",
                  "name": "Splitvero",
                  "url": "https://splitvero.com",
                  "logo": "https://splitvero.com/logo.png"
                },
                {
                  "@type": "WebApplication",
                  "@id": "https://splitvero.com/#webapp",
                  "name": "Splitvero",
                  "url": "https://splitvero.com",
                  "applicationCategory": "FinanceApplication",
                  "operatingSystem": "Web",
                  "description": "A free expense splitter for friends, roommates, and travel groups to split bills, track shared expenses, upload receipts, and settle up.",
                  "creator": { "@id": "https://splitvero.com/#organization" },
                  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
                  "featureList": [
                    "Equal and exact expense splits",
                    "Recurring monthly expenses",
                    "Receipt uploads",
                    "Minimized settle-up payments",
                    "CSV export"
                  ]
                },
                {
                  "@type": "FAQPage",
                  "@id": "https://splitvero.com/#faq",
                  "mainEntity": [
                    { "@type": "Question", "name": "Is Splitvero free to use?", "acceptedAnswer": { "@type": "Answer", "text": "Yes, Splitvero is free to use with no hidden fees or premium tiers." } },
                    { "@type": "Question", "name": "How are settlements calculated?", "acceptedAnswer": { "@type": "Answer", "text": "Splitvero uses a min-cash-flow algorithm to reduce the total number of transactions between group members." } },
                    { "@type": "Question", "name": "Do my friends need to create accounts?", "acceptedAnswer": { "@type": "Answer", "text": "Friends can log in using a secure one-time passcode or Google Sign-In to view the group and add expenses." } },
                    { "@type": "Question", "name": "Can I split expenses unequally?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. You can switch from equal splits to exact splits and manually assign who owes what." } },
                    { "@type": "Question", "name": "Who is the admin of the group?", "acceptedAnswer": { "@type": "Answer", "text": "Splitvero uses a high trust model where anyone in the group can add members, record expenses, or remove members when debts are settled." } }
                  ]
                }
              ]
            }).replace(/</g, "\\u003c")
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
