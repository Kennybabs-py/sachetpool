import type { Metadata } from "next";
import localFont from "next/font/local";

import "./globals.css";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import AppProvider from "@/components/shared/app-provider";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { SmoothScroll } from "@/components/shared/smooth-scroll";

const sans = localFont({
  src: "./fonts/googlesansflex-regular.ttf",
  variable: "--font-sans",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

const title = `${BRAND.name} — ${BRAND.tagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: BRAND.wordmark,
  title: {
    default: title,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  keywords: [
    "pari-mutuel",
    "prediction market",
    "football",
    "soccer",
    "Solana",
    "Robinhood Chain",
    "$SACH",
    "on-chain betting",
  ],
  openGraph: {
    type: "website",
    siteName: BRAND.wordmark,
    title,
    description: BRAND.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: BRAND.description,
  },
  appleWebApp: {
    capable: true,
    title: BRAND.wordmark,
    statusBarStyle: "black-translucent",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full", "antialiased", sans.variable, "font-sans")}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <SmoothScroll>
            <AppProvider>{children}</AppProvider>
          </SmoothScroll>
        </ThemeProvider>
      </body>
    </html>
  );
}
