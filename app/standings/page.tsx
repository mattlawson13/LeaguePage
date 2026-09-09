import Image from "next/image";
import { getCurrentLeague, getRosterManagers } from "@/lib/league";
import { getManagerCareerStats, getSeasonStandings } from "@/lib/stats";
import { avatarUrl, fmtPoints, fmtRecord, ordinal } from "@/lib/format";
import { managerColor } from "@/lib/managerColors";

export const dynamic = "force-dynamic";

export default function StandingsPage() {
  const league = getCurrentLeague();
  if (!league) {
    return <div className="py-10 text-text-muted">No league data ingested yet — run the ingest script.</div>;
  }

  const standings = getSeasonStandings(league.league_id);
  const rosterManagers = getRosterManagers(league.league_id);
  const career = getManagerCareerStats().sort((a, b) => b.wins - a.wins || b.pf - a.pf);

  return (
    <div className="py-10">
      <p className="font-condensed text-sm font-semibold uppercase tracking-widest text-accent">
        {league.season} Season
      </p>
      <h1 className="font-condensed mt-2 text-4xl font-bold uppercase tracking-wide">Standings</h1>

      <div className="mt-8 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-text-muted">
              <th className="px-4 py-3 font-condensed text-xs font-semibold uppercase tracking-wide">#</th>
              <th className="px-4 py-3 font-condensed text-xs font-semibold uppercase tracking-wide">Team</th>
              <th className="table-mono px-4 py-3 text-right font-condensed text-xs font-semibold uppercase tracking-wide">
                Record
              </th>
              <th className="table-mono px-4 py-3 text-right font-condensed text-xs font-semibold uppercase tracking-wide">
                PF
              </th>
              <th className="table-mono px-4 py-3 text-right font-condensed text-xs font-semibold uppercase tracking-wide">
                PA
              </th>
              <th className="table-mono px-4 py-3 text-right font-condensed text-xs font-semibold uppercase tracking-wide">
                Streak
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, i) => {
              const manager = rosterManagers.get(row.rosterId);
              const color = row.ownerId ? managerColor(row.ownerId) : "#666";
              const src = manager ? avatarUrl(manager.avatar) : null;
              return (
                <tr key={row.rosterId} className="border-b border-border last:border-0 odd:bg-surface/40">
                  <td className="px-4 py-3 table-mono text-text-muted">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border-2"
                        style={{ borderColor: color }}
                      >
                        {src ? (
                          <Image src={src} alt={manager?.displayName ?? ""} width={32} height={32} unoptimized />
                        ) : (
                          <span className="font-condensed text-xs font-bold" style={{ color }}>
                            {(manager?.displayName ?? "?").slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <span className="font-medium">{manager?.displayName ?? `Roster ${row.rosterId}`}</span>
                    </div>
                  </td>
                  <td className="table-mono px-4 py-3 text-right">{fmtRecord(row.wins, row.losses, row.ties)}</td>
                  <td className="table-mono px-4 py-3 text-right">{fmtPoints(row.pf)}</td>
                  <td className="table-mono px-4 py-3 text-right text-text-muted">{fmtPoints(row.pa)}</td>
                  <td
                    className={`table-mono px-4 py-3 text-right font-semibold ${
                      row.streak.startsWith("W") ? "text-win" : row.streak.startsWith("L") ? "text-loss" : ""
                    }`}
                  >
                    {row.streak}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="font-condensed mt-14 text-2xl font-bold uppercase tracking-wide">All-Time Career Record</h2>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-text-muted">
              <th className="px-4 py-3 font-condensed text-xs font-semibold uppercase tracking-wide">#</th>
              <th className="px-4 py-3 font-condensed text-xs font-semibold uppercase tracking-wide">Manager</th>
              <th className="table-mono px-4 py-3 text-right font-condensed text-xs font-semibold uppercase tracking-wide">
                Record
              </th>
              <th className="table-mono px-4 py-3 text-right font-condensed text-xs font-semibold uppercase tracking-wide">
                PF
              </th>
              <th className="table-mono px-4 py-3 text-right font-condensed text-xs font-semibold uppercase tracking-wide">
                Avg PF
              </th>
              <th className="table-mono px-4 py-3 text-right font-condensed text-xs font-semibold uppercase tracking-wide">
                Titles
              </th>
              <th className="table-mono px-4 py-3 text-right font-condensed text-xs font-semibold uppercase tracking-wide">
                Playoffs
              </th>
            </tr>
          </thead>
          <tbody>
            {career.map((m, i) => (
              <tr key={m.userId} className="border-b border-border last:border-0 odd:bg-surface/40">
                <td className="px-4 py-3 table-mono text-text-muted">{ordinal(i + 1)}</td>
                <td className="px-4 py-3 font-medium">{m.displayName}</td>
                <td className="table-mono px-4 py-3 text-right">{fmtRecord(m.wins, m.losses, m.ties)}</td>
                <td className="table-mono px-4 py-3 text-right">{fmtPoints(m.pf)}</td>
                <td className="table-mono px-4 py-3 text-right text-text-muted">{fmtPoints(m.avgPf)}</td>
                <td className="table-mono px-4 py-3 text-right text-gold">{m.titles || "—"}</td>
                <td className="table-mono px-4 py-3 text-right text-text-muted">{m.playoffAppearances || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
