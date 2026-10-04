"use client";

import { useState } from "react";

const SAMPLE_PROMPTS = [
  "Multi-tenant SaaS with Supabase, Stripe billing & audit logs",
  "Real-time multiplayer collaborative canvas using WebSockets",
  "AI-powered code review agent with GitHub webhook integration",
  "E-commerce microservices with inventory sync & Redis cache",
];

export default function HeroSection() {
  const [prompt, setPrompt] = useState("");

  const handleSelectSample = (sample: string) => {
    setPrompt(sample);
  };

  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
      {/* Background Glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 -translate-x-1/2 blur-3xl"
        aria-hidden="true"
      >
        <div className="aspect-[1155/678] w-[72.1875rem] bg-gradient-to-tr from-indigo-600/30 via-violet-600/20 to-cyan-500/30 opacity-40" />
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Pill Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300">
          <span className="flex h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
          Autonomous Software Architecture Engine
        </div>

        {/* Headline */}
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl sm:leading-[1.15]">
          Turn Any Project Idea into a{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-violet-300 to-cyan-400 bg-clip-text text-transparent">
            Dependency-Aware Build Graph
          </span>
        </h1>

        {/* Subhead */}
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-300 sm:text-xl font-normal leading-relaxed">
          Deconstruct complex systems into precise modules, prerequisite chains, and critical execution paths before writing a single line of code.
        </p>

        {/* Prompt Input Box */}
        <div id="try-demo" className="mx-auto mt-10 max-w-2xl">
          <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/90 p-2 shadow-2xl backdrop-blur-xl focus-within:border-indigo-500/70 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your project idea (e.g. Real-time multiplayer whiteboard)..."
                className="w-full rounded-xl bg-transparent px-4 py-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (!prompt) setPrompt(SAMPLE_PROMPTS[0]);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-violet-500 transition-all active:scale-95 sm:w-auto shrink-0"
              >
                <span>Generate Graph</span>
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Prompt presets */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 px-2 pb-1 text-xs">
              <span className="text-zinc-500 font-medium mr-1">Try example:</span>
              {SAMPLE_PROMPTS.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectSample(sample)}
                  className="rounded-md border border-zinc-800/80 bg-zinc-950/60 px-2 py-1 text-zinc-400 hover:border-indigo-500/40 hover:text-zinc-200 transition-all truncate max-w-[280px]"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Feature Badges */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <span>Topological Dependency Ordering</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <span>Decoupled Serverless Execution</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <span>Interactive Visual Canvas</span>
          </div>
        </div>
      </div>
    </section>
  );
}
