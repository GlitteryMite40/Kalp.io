"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-[calc(100dvh-4rem)] place-items-center px-4 py-16">
      <section className="w-full max-w-lg rounded-lg border border-rose-500/30 bg-rose-950/20 p-6 shadow-2xl shadow-black/30 sm:p-8">
        <div className="inline-flex rounded-md border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-xs font-semibold text-rose-300">
          Route error
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Something interrupted this view.
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          The app could not finish rendering this route. You can retry the view
          without losing your place.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-zinc-500">
            Digest: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
