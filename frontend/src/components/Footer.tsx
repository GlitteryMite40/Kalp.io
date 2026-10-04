export default function Footer() {
  return (
    <footer className="border-t border-zinc-900 bg-zinc-950 py-12 text-sm text-zinc-500">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white tracking-tight">
              Kalp<span className="text-indigo-400">.io</span>
            </span>
            <span className="text-zinc-600">|</span>
            <span className="text-xs">Turn ideas into dependency-aware build graphs</span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs">
            <span className="text-zinc-400 font-mono">Frontend: Next.js App Router (Vercel)</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400 font-mono">Backend: Decoupled /api (Vercel)</span>
            <span className="text-zinc-600">•</span>
            <a
              href="https://github.com/GlitteryMite40/Kalp.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              GitHub Repository
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-zinc-900/80 pt-6 text-center text-xs text-zinc-600">
          © {new Date().getFullYear()} Kalp.io. Strictly serverless execution, no local state persistence.
        </div>
      </div>
    </footer>
  );
}
