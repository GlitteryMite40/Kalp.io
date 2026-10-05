import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[calc(100dvh-4rem)] place-items-center px-4 py-16">
      <section className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 shadow-2xl shadow-black/30 sm:p-8">
        <div className="inline-flex rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-300">
          404
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          This route is not in the graph.
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          The page you requested does not exist or has moved. Return to the
          workspace and choose a known path.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
        >
          Go home
        </Link>
      </section>
    </main>
  );
}
