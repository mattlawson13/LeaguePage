export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="font-condensed text-sm font-semibold uppercase tracking-widest text-accent">Coming soon</p>
      <h1 className="font-condensed mt-2 text-4xl font-bold uppercase tracking-wide text-text">{title}</h1>
      <p className="mt-4 text-text-muted">{description}</p>
    </div>
  );
}
