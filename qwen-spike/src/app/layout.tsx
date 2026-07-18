import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tokyo Collectible Finder",
  description: "Identify a collectible, compare Japanese asking prices, and plan where to look in Tokyo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${GeistSans.className} ${GeistSans.variable}`}><body>{children}</body></html>;
}
