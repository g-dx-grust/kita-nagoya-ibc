import "./globals.css";
import type { Metadata } from "next";
import { MainLayout } from "@/components/layout";

export const metadata: Metadata = {
  title: "北名古屋 製造管理",
  description: "Kitagoya production planning & inventory system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <MainLayout>{children}</MainLayout>
      </body>
    </html>
  );
}
