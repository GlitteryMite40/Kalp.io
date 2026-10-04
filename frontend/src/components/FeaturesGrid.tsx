export default function FeaturesGrid() {
  const features = [
    {
      title: "Topological Dependency Sorting",
      description:
        "Automatically analyzes prerequisite graphs using Kahn's algorithm to eliminate deadlocks and compute optimal build stages.",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      ),
      accent: "from-indigo-500 to-blue-500",
    },
    {
      title: "Strict Zod Contracts",
      description:
        "Every phase, task, and dependency edge is rigorously validated at compile-time and runtime against strongly-typed schemas.",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      ),
      accent: "from-emerald-500 to-teal-500",
    },
    {
      title: "Decoupled Serverless Architecture",
      description:
        "Frontend UI and API routes run as separate serverless instances on Vercel with zero long-running daemons or local disk locks.",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      ),
      accent: "from-cyan-500 to-blue-500",
    },
    {
      title: "Interactive React Flow Canvas",
      description:
        "Fluid zoom, pan, and node manipulation with real-time dependency highlight and critical path markers.",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        />
      ),
      accent: "from-purple-500 to-pink-500",
    },
    {
      title: "Supabase Postgres Backend",
      description:
        "Cloud-native PostgreSQL with Row Level Security (RLS) ensuring strict isolation and multi-tenant security.",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
        />
      ),
      accent: "from-violet-500 to-indigo-500",
    },
    {
      title: "LLM Autonomous Decomposition",
      description:
        "Smart prompt engineering converts plain-text feature sets into concrete technical tasks, files, and dependency chains.",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      ),
      accent: "from-amber-500 to-orange-500",
    },
  ];

  return (
    <section id="features" className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
            Engineered for Precision
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Everything Needed to Plan Complex Builds
          </h2>
          <p className="mt-4 text-base text-zinc-400">
            From initial prompt to production-ready DAGs, Kalp.io removes
            ambiguity and prevents architectural roadblocks before code is
            written.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="group relative rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-8 hover:border-zinc-700/80 hover:bg-zinc-900/70 transition-all hover:shadow-xl hover:shadow-indigo-500/5 backdrop-blur-sm"
            >
              <div
                className={`mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr ${feature.accent} p-2.5 text-white shadow-lg shadow-indigo-500/10`}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {feature.icon}
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
