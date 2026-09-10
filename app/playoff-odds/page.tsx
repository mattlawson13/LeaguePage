import { simulatePlayoffOdds, getPlayoffOddsHistory } from "@/lib/playoffOdds";
import { resolveManagers, managerHref } from "@/lib/managers";
import { managerColor } from "@/lib/managerColors";
import { PlayoffOddsChart } from "@/components/PlayoffOddsChart";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function PlayoffOddsPage() {
  const run = simulatePlayoffOdds();
  const history = getPlayoffOddsHistory();
  const managers = resolveManagers();

  if (!run) {
    return <div className="py-14 text-text-muted">No league data ingested yet — run the ingest script.</div>;
  }

  const weeksOfData = new Set(history.map((h) => h.week)).size;

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">{run.season} season</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Playoff odds</h1>
      <p className="mt-3 max-w-xl text-text-muted">
        {run.simulations.toLocaleString()} simulations of the {run.remainingWeeks.length} remaining regular-season
        weeks, using the real published schedule and each team&apos;s own scoring distribution (shrunk toward the
        league average early in the season, when there&apos;s little signal yet).
      </p>

      <div className="mt-10">
        <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Make-playoffs % over time</h2>
        {weeksOfData <= 1 ? (
          <p className="mt-1 text-sm text-text-dim">
            Only one week of snapshots so far — this fills in as the ingest script runs across the season.
          </p>
        ) : null}
        <div className="mt-4">
          <PlayoffOddsChart history={history} />
        </div>
      </div>

      <div className="mt-12 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-text-dim/40 text-left text-text-muted">
              <th className="py-2 pr-2 font-normal">#</th>
              <th className="py-2 pr-2 font-normal">Manager</th>
              <th className="table-mono py-2 pr-2 text-right font-normal">Playoffs</th>
              {Array.from({ length: run.playoffTeams }, (_, i) => (
                <th key={i} className="table-mono py-2 pr-2 text-right font-normal">
                  Seed {i + 1}
                </th>
              ))}
              <th className="table-mono py-2 pr-2 text-right font-normal">Title</th>
              <th className="table-mono py-2 text-right font-normal">Last</th>
            </tr>
          </thead>
          <tbody>
            {run.results.map((r, i) => {
              const m = r.userId ? managers.find((mm) => mm.userId === r.userId) : undefined;
              const color = r.userId ? managerColor(r.userId) : "var(--color-text-dim)";
              return (
                <tr key={r.rosterId} className="border-b border-border">
                  <td className="table-mono py-2.5 pr-2 text-text-dim">{i + 1}</td>
                  <td className="py-2.5 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                      {m ? (
                        <Link href={managerHref(m.sleeper_username)} className="text-text hover:text-accent">
                          {r.displayName}
                        </Link>
                      ) : (
                        <span className="text-text">{r.displayName}</span>
                      )}
                    </div>
                  </td>
                  <td className="table-mono py-2.5 pr-2 text-right font-semibold text-text">{r.makePlayoffsPct.toFixed(1)}%</td>
                  {r.seedPct.map((pct, si) => (
                    <td key={si} className="table-mono py-2.5 pr-2 text-right text-text-muted">
                      {pct >= 0.1 ? `${pct.toFixed(1)}%` : "—"}
                    </td>
                  ))}
                  <td className="table-mono py-2.5 pr-2 text-right text-gold">{r.titlePct.toFixed(1)}%</td>
                  <td className="table-mono py-2.5 text-right text-loss">{r.lastPlacePct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
