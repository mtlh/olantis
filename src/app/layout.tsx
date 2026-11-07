import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

// Single display font. Geist_Mono was dropped: nothing in src uses it —
// the only reference to --font-geist-mono was the variable declaration
// below, and no font-mono utility appears anywhere — so shipping it only
// added a second blocking font payload for zero rendered glyphs.
// next/font self-hosts the woff2 under /_next/static/media at build time,
// so there is no remote fonts.googleapis.com request and no preconnect to add.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  fallback: ["system-ui", "sans-serif"],
});
export const metadata: Metadata = {
  title: "Olantis — Portfolio Dashboard",
  description: "Simple portfolio tracker",
  // Icons come from the metadata file conventions (app/favicon.ico, app/icon.png,
  // app/apple-icon.png) so Next serves content-hashed URLs. Hardcoding them here
  // pinned browsers to stale, un-hashed URLs and kept showing the old icon.
};
import { ToastProvider } from "@/components/ui/toast";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full dark`}>
      <body className="min-h-full antialiased">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-black focus:shadow-lg">Skip to main content</a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
