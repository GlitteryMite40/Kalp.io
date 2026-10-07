import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
