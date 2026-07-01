import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OCT AI Report Assistant",
  description: "AI-assisted ophthalmology report generation MVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
