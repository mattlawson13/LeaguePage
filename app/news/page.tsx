import { getNewsFeed, getTrendingPlayers } from "@/lib/news";

export const dynamic = "force-dynamic";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NewsPage() {
  const articles = getNewsFeed();
  const trending = getTrendingPlayers();
  const trendingAdds = trending.filter((t) => t.type === "add");
  const trendingDrops = trending.filter((t) => t.type === "drop");

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">The league</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">News</h1>
      <p className="mt-3 max-w-xl text-text-muted">
        NFL news filtered to players currently rostered in this league, pulled from ESPN, RotoWire, CBS Sports, and
        PFF.
      </p>

      <div className="mt-10 divide-y divide-border border-t border-border">
        {articles.length === 0 && <p className="py-6 text-text-muted">No relevant articles yet — check back after the next ingest.</p>}
        {articles.map((a) => (
          <a key={a.link} href={a.link} target="_blank" rel="noopener noreferrer" className="group block py-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span>{a.source}</span>
              {a.pubDate && (
                <>
                  <span>·</span>
                  <span>{formatDate(a.pubDate)}</span>
                </>
              )}
            </div>
            <p className="mt-1 text-text group-hover:text-accent">{a.title}</p>
            {a.players.length > 0 && (
              <p className="mt-1 text-sm text-text-dim">
                {a.players.map((p, i) => (
                  <span key={p.playerId}>
                    {i > 0 && ", "}
                    {p.name}
                    {p.managerName ? ` (${p.managerName})` : ""}
                  </span>
                ))}
              </p>
            )}
          </a>
        ))}
      </div>

      {(trendingAdds.length > 0 || trendingDrops.length > 0) && (
        <div className="mt-12">
          <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Trending on Sleeper</h2>
          <p className="mt-1 text-xs text-text-dim">Data via Sleeper.</p>
          <div className="mt-4 grid gap-8 sm:grid-cols-2">
            <div>
              <p className="text-xs text-text-muted">Most added</p>
              <div className="mt-2 flex flex-col gap-2">
                {trendingAdds.slice(0, 10).map((t) => (
                  <div key={t.playerId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text">
                      {t.name}
                      {t.team ? <span className="text-text-dim"> · {t.team}</span> : null}
                      {t.managerName ? <span className="text-text-dim"> · {t.managerName}</span> : null}
                    </span>
                    <span className="table-mono text-win">+{t.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-text-muted">Most dropped</p>
              <div className="mt-2 flex flex-col gap-2">
                {trendingDrops.slice(0, 10).map((t) => (
                  <div key={t.playerId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text">
                      {t.name}
                      {t.team ? <span className="text-text-dim"> · {t.team}</span> : null}
                      {t.managerName ? <span className="text-text-dim"> · {t.managerName}</span> : null}
                    </span>
                    <span className="table-mono text-loss">−{t.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
