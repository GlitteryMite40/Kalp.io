"use client";

import Link from "next/link";

export default function Navbar() {
  const handleAnchorClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetId: string,
  ) => {
    if (typeof window !== "undefined") {
      if (window.location.pathname === "/") {
        const el = document.getElementById(targetId);
        if (el) {
          e.preventDefault();
          el.scrollIntoView({ behavior: "smooth" });
          window.history.pushState(null, "", `#${targetId}`);
          if (targetId === "try-demo" || targetId === "build-graph") {
            const input = document.getElementById("idea-input");
            if (input) {
              setTimeout(() => input.focus(), 350);
            }
          }
        } else {
          // If element not in DOM (e.g. pipeline running/completed), reset home
          window.dispatchEvent(new CustomEvent("kalp:navigate-home"));
        }
      } else {
        // Navigating from another route (/projects, /p/:id)
        localStorage.removeItem("kalp_active_project_id");
      }
    }
  };

  const handleHomeClick = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("kalp_active_project_id");
      window.dispatchEvent(new CustomEvent("kalp:navigate-home"));
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-zinc-950/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            onClick={handleHomeClick}
            className="flex items-center gap-2 group"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-shadow">
              <div className="flex h-full w-full items-center justify-center rounded-[11px] bg-zinc-950">
                <svg
                  className="h-5 w-5 text-indigo-400 group-hover:text-indigo-300 transition-colors"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="18" cy="18" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M6 9v6" />
                  <path d="M9 6h6" />
                  <path d="m9 15 6-6" />
                </svg>
              </div>
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              Kalp<span className="text-indigo-400">.io</span>
            </span>
          </Link>
          <span className="hidden sm:inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
            v0.1 Preview
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
          <Link href="/projects" className="hover:text-white transition-colors">
            Projects
          </Link>
          <Link
            href="/#graph-preview"
            onClick={(e) => handleAnchorClick(e, "graph-preview")}
            className="hover:text-white transition-colors"
          >
            Build Graph
          </Link>
          <Link
            href="/#features"
            onClick={(e) => handleAnchorClick(e, "features")}
            className="hover:text-white transition-colors"
          >
            Features
          </Link>
          <Link
            href="/#architecture"
            onClick={(e) => handleAnchorClick(e, "architecture")}
            className="hover:text-white transition-colors"
          >
            Architecture
          </Link>
          <a
            href="https://github.com/GlitteryMite40/Kalp.io"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors flex items-center gap-1.5"
          >
            GitHub
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/#try-demo"
            onClick={(e) => handleAnchorClick(e, "try-demo")}
            className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 hover:from-indigo-400 hover:to-violet-500 transition-all active:scale-[0.98]"
          >
            Start Building
          </Link>
        </div>
      </div>
    </header>
  );
}
