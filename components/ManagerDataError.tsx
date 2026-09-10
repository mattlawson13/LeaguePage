export function ManagerDataError({ message }: { message: string }) {
  const isResolutionError = message.startsWith("resolveManagers:");
  return (
    <div className="max-w-xl py-20">
      <p className="text-sm text-loss">{isResolutionError ? "Manager data error" : "Something broke"}</p>
      <h1 className="font-condensed mt-1 text-2xl font-bold tracking-tight text-text">
        {isResolutionError ? "A manager failed to resolve" : "This page hit an error"}
      </h1>
      {isResolutionError && (
        <p className="mt-3 text-text-muted">
          <code className="text-sm">data/managers.json</code> could not be matched to real Sleeper accounts. This
          fails loudly on purpose rather than silently dropping a manager from the site — fix the mismatch below and
          reload.
        </p>
      )}
      <pre className="mt-6 overflow-x-auto whitespace-pre-wrap border-l-2 border-loss py-1 pl-4 text-sm text-loss">
        {message}
      </pre>
    </div>
  );
}
