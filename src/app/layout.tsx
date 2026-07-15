import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AFIO Clinical Workflow System",
  description: "Licensed ophthalmology modules with department-scoped reporting workflows"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var saved = localStorage.getItem('afio-theme');
                var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                if ((saved && saved === 'dark') || (!saved && prefersDark)) {
                  document.documentElement.classList.add('dark');
                }
              } catch (_) {}
            `
          }}
        />
        {children}
      </body>
    </html>
  );
}
