import type { Metadata } from "next";
import { Inter, Geist_Mono, Google_Sans_Flex } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import AppProvider from "@/components/shared/app-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const googleSansFlex = Google_Sans_Flex({
  variable: "--font-google-sans-flex",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sachet",
  description:
    "Pari-mutuel football prediction markets, staked in $SACH on Robinhood Chain.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
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
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
