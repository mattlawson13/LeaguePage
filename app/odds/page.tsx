import Link from "next/link";
import { getWeekOdds, getSeasonFutures } from "@/lib/odds";
import { getCurrentLeague, getCurrentWeek } from "@/lib/league";
import { resolveManagers, managerHref } from "@/lib/managers";
import { managerColor } from "@/lib/managerColors";

export const dynamic = "force-dynamic";

function fmtMoneyline(ml: number): string {
  return ml > 0 ? `+${ml}` : `${ml}`;
}

export default function OddsPage() {
  const league = getCurrentLeague();
  const week = getCurrentWeek();
  const matchups = getWeekOdds();
  const futures = getSeasonFutures();
  const managers = resolveManagers();

  if (!league) {
    return <div className="py-14 text-text-muted">No league data ingested yet — run the ingest script.</div>;
  }

  const nameLink = (userId: string | null, name: string) => {
    const m = userId ? managers.find((mm) => mm.userId === userId) : undefined;
    const color = userId ? managerColor(userId) : "var(--color-text-dim)";
    const inner = (
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
        {name}
      </span>
    );
    return m ? (
      <Link href={managerHref(m.sleeper_username)} className="text-text hover:text-accent">
        {inner}
      </Link>
    ) : (
      <span className="text-text">{inner}</span>
    );
  };

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">{league.season} season · week {week}</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Betting odds</h1>
      <p className="mt-3 max-w-xl text-text-muted">
        No sportsbook prices fantasy matchups, so this is the house: each team&apos;s scoring distribution this
        season (shrunk toward the league average early on), simulated 10,000 times per matchup, with a ~4.5% vig
        baked into the prices.
      </p>

      <div className="mt-10">
        <h2 className="font-condensed text-xl font-bold tracking-tight text-text">This week</h2>
        <div className="mt-4 divide-y divide-border border-t border-border">
          {matchups.length === 0 && <p className="py-6 text-text-muted">No matchups scheduled this week.</p>}
          {matchups.map((m) => (
            <div key={`${m.rosterA.rosterId}-${m.rosterB.rosterId}`} className="grid grid-cols-[1fr_auto] items-center gap-4 py-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-4">
                  {nameLink(m.rosterA.userId, m.rosterA.displayName)}
                  <span className="table-mono text-sm text-text">{fmtMoneyline(m.moneylineA)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  {nameLink(m.rosterB.userId, m.rosterB.displayName)}
                  <span className="table-mono text-sm text-text">{fmtMoneyline(m.moneylineB)}</span>
                </div>
              </div>
              <div className="table-mono text-right text-sm text-text-muted">
                <p>{m.spread < 0 ? `${m.rosterA.displayName} ${m.spread}` : m.spread > 0 ? `${m.rosterA.displayName} +${m.spread}` : "pick'em"}</p>
                <p>O/U {m.total}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {futures && (
        <div className="mt-12 grid gap-10 sm:grid-cols-3">
          <div>
            <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Title odds</h2>
            <div className="mt-3 flex flex-col gap-2">
              {futures.title.map((f) => (
                <div key={f.rosterId} className="flex items-center justify-between gap-3 text-sm">
                  {nameLink(f.userId, f.displayName)}
                  <span className="table-mono text-gold">{fmtMoneyline(f.moneyline)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Most points for</h2>
            <div className="mt-3 flex flex-col gap-2">
              {futures.mostPf.map((f) => (
                <div key={f.rosterId} className="flex items-center justify-between gap-3 text-sm">
                  {nameLink(f.userId, f.displayName)}
                  <span className="table-mono text-text">{fmtMoneyline(f.moneyline)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Last place</h2>
            <div className="mt-3 flex flex-col gap-2">
              {futures.lastPlace.map((f) => (
                <div key={f.rosterId} className="flex items-center justify-between gap-3 text-sm">
                  {nameLink(f.userId, f.displayName)}
                  <span className="table-mono text-loss">{fmtMoneyline(f.moneyline)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
