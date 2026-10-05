import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://kalp.io"),
  title: {
    default: "Kalp.io - Dependency-Aware Build Graphs",
    template: "%s | Kalp.io",
  },
  description:
    "Turn project ideas into dependency-aware build graphs and execution plans.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "Kalp.io - Dependency-Aware Build Graphs",
    description:
      "Turn project ideas into dependency-aware build graphs and execution plans.",
    type: "website",
    url: "https://kalp.io",
    siteName: "Kalp.io",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30 selection:text-indigo-200">
        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md">
            <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <Link
                href="/"
                className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-sm font-black text-cyan-300">
                  K
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold leading-5 tracking-tight text-white">
                    Kalp.io
                  </span>
                  <span className="hidden text-xs leading-4 text-zinc-400 sm:block">
                    Build graph workspace
                  </span>
                </span>
              </Link>

              <nav
                aria-label="Primary navigation"
                className="flex shrink-0 items-center gap-1 text-sm font-medium text-zinc-300 sm:gap-2"
              >
                <Link
                  href="/"
                  className="rounded-md px-2.5 py-2 transition hover:bg-zinc-900 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 sm:px-3"
                >
                  Home
                </Link>
                <Link
                  href="/gemini_status"
                  className="rounded-md px-2.5 py-2 transition hover:bg-zinc-900 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 sm:px-3"
                >
                  Status
                </Link>
              </nav>
            </div>
          </header>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
