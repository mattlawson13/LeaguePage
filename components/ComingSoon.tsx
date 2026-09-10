export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-lg py-20">
      <p className="text-sm text-text-muted">Coming soon</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">{title}</h1>
      <p className="mt-3 text-text-muted">{description}</p>
    </div>
  );
}
