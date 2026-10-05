export default function Loading() {
  return (
    <main className="grid min-h-[calc(100dvh-4rem)] place-items-center px-4 py-16">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 shadow-2xl shadow-black/30">
        <div className="flex items-center gap-4">
          <div
            aria-hidden="true"
            className="size-10 shrink-0 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-300"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              Preparing workspace
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Loading the next view.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
