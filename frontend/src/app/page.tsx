import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import GraphPreview from "@/components/GraphPreview";
import FeaturesGrid from "@/components/FeaturesGrid";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <Navbar />

      <main className="flex-1">
        <HeroSection />
        <GraphPreview />
        <FeaturesGrid />

        {/* Architecture Section */}
        <section
          id="architecture"
          className="py-20 md:py-28 border-t border-zinc-900 bg-zinc-950/60"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto">
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                System Topology
              </span>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
                Decoupled Serverless Architecture
              </h2>
              <p className="mt-4 text-base text-zinc-400">
                Designed from day one for zero server maintenance, high
                horizontal concurrency, and strict separation of concerns.
              </p>
            </div>

            <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Frontend Card */}
              <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-6 backdrop-blur-md">
                <div className="inline-flex rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-400 mb-4">
                  kalp-io / frontend
                </div>
                <h3 className="text-lg font-bold text-white">
                  Frontend UI Layer
                </h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                  Next.js App Router providing pages, interactive React Flow
                  canvases, and client state. Dedicated Vercel deployment with
                  zero database/AI keys exposed.
                </p>
                <div className="mt-4 border-t border-zinc-800/80 pt-4 text-xs font-mono text-zinc-500">
                  Target: Vercel (Edge & Node.js)
                </div>
              </div>

              {/* Vercel Services Connector */}
              <div className="rounded-2xl border border-cyan-800/40 bg-cyan-950/10 p-6 backdrop-blur-md relative">
                <div className="inline-flex rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 text-xs font-semibold text-cyan-400 mb-4">
                  Vercel Services
                </div>
                <h3 className="text-lg font-bold text-white">
                  /api → Backend Routing
                </h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                  <code className="text-cyan-300 font-mono">vercel.json</code>{" "}
                  declaratively routes all{" "}
                  <code className="text-cyan-300 font-mono">/api/*</code>{" "}
                  traffic to the backend service and everything else to the
                  frontend service on the same domain.
                </p>
                <div className="mt-4 border-t border-zinc-800/80 pt-4 text-xs font-mono text-cyan-500">
                  Routing: vercel.json services
                </div>
              </div>

              {/* Backend Card */}
              <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-6 backdrop-blur-md">
                <div className="inline-flex rounded-lg bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 text-xs font-semibold text-violet-400 mb-4">
                  kalp-io / backend
                </div>
                <h3 className="text-lg font-bold text-white">
                  Serverless API Engine
                </h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                  Headless Next.js App Router providing API routes only.
                  Executes LLM DAG prompts, validates contracts with Zod, and
                  persists graphs to Supabase Postgres.
                </p>
                <div className="mt-4 border-t border-zinc-800/80 pt-4 text-xs font-mono text-zinc-500">
                  Target: Vercel Serverless Functions
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
