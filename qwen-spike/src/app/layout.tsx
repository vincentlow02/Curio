import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tokyo Collectible Finder",
  description: "Identify a collectible, compare Japanese asking prices, and plan where to look in Tokyo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><div className="mobile-notice">当前版本针对桌面浏览器优化，请使用宽度 1024px 以上的设备。</div>{children}</body></html>;
}
