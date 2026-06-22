import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

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
  title: {
    default: "Splitvero | Expense Splitter",
    template: "%s | Splitvero",
  },
  description: "A fast, beautiful, and focused expense splitter for roommates and friend groups.",
  keywords: ["expense splitter", "split bills", "roommate expenses", "shared expenses", "finance app"],
  authors: [{ name: "Splitvero Team" }],
  creator: "Splitvero",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://splitvero.example.com",
    title: "Splitvero | Expense Splitter",
    description: "A fast, beautiful, and focused expense splitter for roommates and friend groups.",
    siteName: "Splitvero",
  },
  twitter: {
    card: "summary_large_image",
    title: "Splitvero | Expense Splitter",
    description: "A fast, beautiful, and focused expense splitter for roommates and friend groups.",
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
