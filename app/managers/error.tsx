"use client";

export default function ManagersError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24">
      <p className="font-condensed text-sm font-semibold uppercase tracking-widest text-loss">Manager data error</p>
      <h1 className="font-condensed mt-2 text-3xl font-bold uppercase tracking-wide text-text">
        A manager failed to resolve
      </h1>
      <p className="mt-4 text-text-muted">
        <code className="text-sm">data/managers.json</code> could not be matched to real Sleeper accounts. This fails
        loudly on purpose rather than silently dropping a manager from the site — fix the mismatch below and reload.
      </p>
      <pre className="mt-6 overflow-x-auto whitespace-pre-wrap rounded-lg border border-loss/40 bg-surface p-4 text-sm text-loss">
        {error.message}
      </pre>
    </div>
  );
}
