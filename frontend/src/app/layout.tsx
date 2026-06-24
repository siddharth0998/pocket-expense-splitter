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
      <head>
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
      </head>
      <body className="min-h-full flex flex-col">
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
