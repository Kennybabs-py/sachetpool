import type { Metadata } from "next";
import { Inter, Geist_Mono, Google_Sans_Flex } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import AppProvider from "@/components/shared/app-provider";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { SmoothScroll } from "@/components/shared/smooth-scroll";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const googleSansFlex = Google_Sans_Flex({
  variable: "--font-google-sans-flex",
  subsets: ["latin"],
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
      className={cn(
        "h-full",
        "antialiased",
        googleSansFlex.variable,
        geistMono.variable,
        inter.variable,
        "font-sans",
      )}
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
