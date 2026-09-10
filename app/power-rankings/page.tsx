import Link from "next/link";
import { computePowerRankings } from "@/lib/powerRankings";
import { getCurrentLeague, getCurrentWeek } from "@/lib/league";
import { resolveManagers, managerHref } from "@/lib/managers";
import { managerColor } from "@/lib/managerColors";
import { avatarUrl } from "@/lib/format";
import { CdnImage } from "@/components/CdnImage";

export const dynamic = "force-dynamic";

function MovementBadge({ movement }: { movement: number | null }) {
  if (movement === null || movement === 0) {
    return <span className="table-mono text-xs text-text-dim">-</span>;
  }
  const up = movement > 0;
  return (
    <span className={`table-mono text-xs ${up ? "text-win" : "text-loss"}`}>
      {up ? "▲" : "▼"} {Math.abs(movement)}
    </span>
  );
}

export default function PowerRankingsPage() {
  const league = getCurrentLeague();
  if (!league) {
    return <div className="py-14 text-text-muted">No league data ingested yet. Run the ingest script.</div>;
  }

  const week = getCurrentWeek();
  const rankings = computePowerRankings();
  const managers = resolveManagers();
  const weightPct = Math.round((rankings[0]?.recentWeight ?? 0) * 100);

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">
        {league.season} season · week {week}
      </p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Power rankings</h1>
      <p className="mt-3 max-w-xl text-text-muted">
        A blend of all-time record and scoring against this season&apos;s own record and scoring, weighted {weightPct}%
        toward this season right now. Early in the year that leans on history; by week 8 it&apos;s entirely this
        season.
      </p>

      <div className="mt-10 divide-y divide-border border-t border-border">
        {rankings.map((r, i) => {
          const m = r.userId ? managers.find((mm) => mm.userId === r.userId) : undefined;
          const color = r.userId ? managerColor(r.userId) : "var(--color-text-dim)";
          const src = avatarUrl(r.avatar);
          return (
            <div key={r.rosterId} className="flex items-center gap-4 py-4">
              <span className="font-condensed w-6 shrink-0 text-xl font-bold text-text-dim">{i + 1}</span>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-base">
                {src ? (
                  <CdnImage src={src} alt="" width={32} height={32} unoptimized />
                ) : (
                  <span className="text-xs text-text-dim">{r.displayName.slice(0, 1)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                  {m ? (
                    <Link href={managerHref(m.sleeper_username)} className="truncate text-text hover:text-accent">
                      {r.displayName}
                    </Link>
                  ) : (
                    <span className="truncate text-text">{r.displayName}</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-text-dim">{r.tag}</p>
              </div>
              <div className="table-mono shrink-0 text-right text-sm text-text-muted">
                <p>{r.currentRecord} this year</p>
                <p className="text-text-dim">{r.allTimeRecord} all-time</p>
              </div>
              <div className="w-14 shrink-0 text-right">
                <MovementBadge movement={r.movement} />
              </div>
              <div className="font-condensed w-14 shrink-0 text-right text-xl font-bold text-text">
                {r.score.toFixed(0)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
