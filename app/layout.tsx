import type { Metadata, Viewport } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";

// Route segment config can't be exported from a "use client" page,
// so it lives here and applies to every route under this layout.
export const dynamic = "force-dynamic";

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ระดับน้ำสมุทรสงคราม",
  description: "ติดตามระดับน้ำและน้ำทะเลหนุนในสมุทรสงครามแบบเรียลไทม์",
};

export const viewport: Viewport = {
  themeColor: "#0a1a20",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${prompt.variable} h-full antialiased`}>
      <body className="h-[100dvh] overflow-hidden">{children}</body>
    </html>
  );
}