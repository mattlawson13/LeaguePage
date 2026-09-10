import Link from "next/link";
import { getSeasonArchive, getHighestSingleWeek, getHighestSingleSeasonPf, getLongestWinStreak } from "@/lib/history";
import { resolveManagers, managerHref } from "@/lib/managers";
import { fmtPoints, ordinal } from "@/lib/format";

export const dynamic = "force-dynamic";

function hrefFor(userId: string, managers: ReturnType<typeof resolveManagers>): string | null {
  const m = managers.find((mm) => mm.userId === userId);
  return m ? managerHref(m.sleeper_username) : null;
}

function NameLink({ userId, name, managers, className }: { userId: string; name: string; managers: ReturnType<typeof resolveManagers>; className?: string }) {
  const href = hrefFor(userId, managers);
  if (!href) return <span className={className}>{name}</span>;
  return (
    <Link href={href} className={`${className ?? ""} hover:text-accent`}>
      {name}
    </Link>
  );
}

export default function HistoryPage() {
  const managers = resolveManagers();
  const archive = getSeasonArchive();
  const highestWeek = getHighestSingleWeek();
  const highestSeasonPf = getHighestSingleSeasonPf();
  const winStreak = getLongestWinStreak();

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">The league</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">History</h1>

      <div className="mt-10 grid grid-cols-1 gap-6 border-y border-border py-6 sm:grid-cols-3">
        {highestWeek && (
          <div>
            <p className="text-xs text-text-muted">Highest single week</p>
            <p className="font-condensed stat-num mt-1 text-2xl font-bold text-text">{fmtPoints(highestWeek.points)}</p>
            <p className="mt-0.5 text-sm text-text-muted">
              <NameLink userId={highestWeek.userId} name={highestWeek.displayName} managers={managers} /> ·{" "}
              {highestWeek.season} wk {highestWeek.week}
            </p>
          </div>
        )}
        {highestSeasonPf && (
          <div>
            <p className="text-xs text-text-muted">Highest single-season PF</p>
            <p className="font-condensed stat-num mt-1 text-2xl font-bold text-text">{fmtPoints(highestSeasonPf.pf)}</p>
            <p className="mt-0.5 text-sm text-text-muted">
              <NameLink userId={highestSeasonPf.userId} name={highestSeasonPf.displayName} managers={managers} /> ·{" "}
              {highestSeasonPf.season}
            </p>
          </div>
        )}
        {winStreak && (
          <div>
            <p className="text-xs text-text-muted">Longest win streak</p>
            <p className="font-condensed stat-num mt-1 text-2xl font-bold text-text">{winStreak.length} games</p>
            <p className="mt-0.5 text-sm text-text-muted">
              <NameLink userId={winStreak.userId} name={winStreak.displayName} managers={managers} /> · {winStreak.startSeason} wk{" "}
              {winStreak.startWeek}–{winStreak.endSeason} wk {winStreak.endWeek}
            </p>
          </div>
        )}
      </div>

      <div className="mt-12 flex flex-col gap-12">
        {archive.map((entry) => (
          <div key={entry.season}>
            <h2 className="font-condensed text-xl font-bold tracking-tight text-text">{entry.season}</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[440px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-text-dim/40 text-left text-text-muted">
                    <th className="py-2 pr-2 font-normal">#</th>
                    <th className="py-2 pr-2 font-normal">Manager</th>
                    <th className="table-mono py-2 pr-2 text-right font-normal">Record</th>
                    <th className="table-mono py-2 pr-2 text-right font-normal">PF</th>
                    <th className="table-mono py-2 text-right font-normal">PA</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.standings.map((row) => (
                    <tr key={row.userId || row.displayName} className="border-b border-border">
                      <td className="table-mono py-2 pr-2 text-text-dim">{ordinal(row.finish)}</td>
                      <td className="py-2 pr-2">
                        <NameLink userId={row.userId} name={row.displayName} managers={managers} className="text-text" />
                      </td>
                      <td className="table-mono py-2 pr-2 text-right">{row.record}</td>
                      <td className="table-mono py-2 pr-2 text-right">{fmtPoints(row.pf)}</td>
                      <td className="table-mono py-2 text-right text-text-muted">{fmtPoints(row.pa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
