import { getCurrentLeague, getRosterManagers } from "@/lib/league";
import { getManagerCareerStats, getSeasonStandings } from "@/lib/stats";
import { avatarUrl, fmtPoints, fmtRecord, ordinal } from "@/lib/format";
import { managerColor } from "@/lib/managerColors";
import { CdnImage } from "@/components/CdnImage";

export const dynamic = "force-dynamic";

function ManagerCell({ name, color, avatar }: { name: string; color: string; avatar: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-base">
        {avatar ? (
          <CdnImage src={avatar} alt="" width={24} height={24} unoptimized />
        ) : (
          <span className="text-[10px] text-text-dim">{name.slice(0, 1)}</span>
        )}
      </div>
      <span className="text-text">{name}</span>
    </div>
  );
}

export default function StandingsPage() {
  const league = getCurrentLeague();
  if (!league) {
    return <div className="py-14 text-text-muted">No league data ingested yet. Run the ingest script.</div>;
  }

  const standings = getSeasonStandings(league.league_id);
  const rosterManagers = getRosterManagers(league.league_id);
  const career = getManagerCareerStats().sort((a, b) => b.wins - a.wins || b.pf - a.pf);

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">{league.season} season</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Standings</h1>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[540px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-text-dim/40 text-left text-text-muted">
              <th className="py-2 pr-2 font-normal">#</th>
              <th className="py-2 pr-2 font-normal">Team</th>
              <th className="table-mono py-2 pr-2 text-right font-normal">Record</th>
              <th className="table-mono py-2 pr-2 text-right font-normal">PF</th>
              <th className="table-mono py-2 pr-2 text-right font-normal">PA</th>
              <th className="table-mono py-2 text-right font-normal">Streak</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, i) => {
              const manager = rosterManagers.get(row.rosterId);
              const color = row.ownerId ? managerColor(row.ownerId) : "var(--color-text-dim)";
              const src = manager ? avatarUrl(manager.avatar) : null;
              return (
                <tr key={row.rosterId} className="border-b border-border">
                  <td className="table-mono py-2.5 pr-2 text-text-dim">{i + 1}</td>
                  <td className="py-2.5 pr-2">
                    <ManagerCell name={manager?.displayName ?? `Roster ${row.rosterId}`} color={color} avatar={src} />
                  </td>
                  <td className="table-mono py-2.5 pr-2 text-right">{fmtRecord(row.wins, row.losses, row.ties)}</td>
                  <td className="table-mono py-2.5 pr-2 text-right">{fmtPoints(row.pf)}</td>
                  <td className="table-mono py-2.5 pr-2 text-right text-text-muted">{fmtPoints(row.pa)}</td>
                  <td
                    className={`table-mono py-2.5 text-right ${
                      row.streak.startsWith("W") ? "text-win" : row.streak.startsWith("L") ? "text-loss" : "text-text-dim"
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

      <h2 className="font-condensed mt-16 text-xl font-bold tracking-tight text-text">All-time career record</h2>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-text-dim/40 text-left text-text-muted">
              <th className="py-2 pr-2 font-normal">#</th>
              <th className="py-2 pr-2 font-normal">Manager</th>
              <th className="table-mono py-2 pr-2 text-right font-normal">Record</th>
              <th className="table-mono py-2 pr-2 text-right font-normal">PF</th>
              <th className="table-mono py-2 pr-2 text-right font-normal">Avg PF</th>
              <th className="table-mono py-2 pr-2 text-right font-normal">Titles</th>
              <th className="table-mono py-2 text-right font-normal">Playoffs</th>
            </tr>
          </thead>
          <tbody>
            {career.map((m, i) => (
              <tr key={m.userId} className="border-b border-border">
                <td className="table-mono py-2.5 pr-2 text-text-dim">{ordinal(i + 1)}</td>
                <td className="py-2.5 pr-2 text-text">{m.displayName}</td>
                <td className="table-mono py-2.5 pr-2 text-right">{fmtRecord(m.wins, m.losses, m.ties)}</td>
                <td className="table-mono py-2.5 pr-2 text-right">{fmtPoints(m.pf)}</td>
                <td className="table-mono py-2.5 pr-2 text-right text-text-muted">{fmtPoints(m.avgPf)}</td>
                <td className="table-mono py-2.5 pr-2 text-right text-gold">{m.titles || "-"}</td>
                <td className="table-mono py-2.5 text-right text-text-muted">{m.playoffAppearances || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
