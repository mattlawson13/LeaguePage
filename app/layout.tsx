import type { Metadata } from "next";
import { Barlow_Condensed, Work_Sans, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { Nav } from "@/components/Nav";
import "./globals.css";

const condensed = Barlow_Condensed({
  variable: "--font-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const sans = Work_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lawson Fantasy Football Gang",
  description: "League hub for Lawson Fantasy Football Gang: matchups, standings, history, and more.",
};

// Applies a saved theme choice before first paint so there's no flash of the
// wrong theme. Left unset, the site follows system preference via CSS alone.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${condensed.variable} ${sans.variable} ${mono.variable} h-full`}>
      <body className="min-h-full bg-base text-text antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <Nav />
        <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
