import Link from "next/link";
import { getCurrentLeague, getCurrentWeek, getSeasons } from "@/lib/league";
import { getManagerCareerStats } from "@/lib/stats";
import { fmtPoints } from "@/lib/format";

export const dynamic = "force-dynamic";

const QUICK_LINKS = [
  { href: "/matchups", label: "This week's matchups", desc: "Lineups, scores, and storylines" },
  { href: "/standings", label: "Standings", desc: "Current record and all-time career stats" },
  { href: "/transactions", label: "Transactions", desc: "Every add, drop, waiver, and trade" },
];

export default function Home() {
  const league = getCurrentLeague();
  const week = getCurrentWeek();
  const seasons = getSeasons();
  const topScorer = [...getManagerCareerStats()].sort((a, b) => b.pf - a.pf)[0];

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">
        {league?.season ?? "—"} season · week {week}
      </p>
      <h1 className="font-condensed mt-1 text-4xl font-bold tracking-tight text-text sm:text-5xl">
        {league?.name ?? "League Hub"}
      </h1>
      <p className="mt-3 max-w-md text-text-muted">
        {seasons.length} season{seasons.length === 1 ? "" : "s"} of history, served from a local database — Sleeper
        is never called on page load.
      </p>

      <div className="mt-10 divide-y divide-border border-t border-border">
        {QUICK_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="group flex items-baseline justify-between gap-4 py-4">
            <span>
              <span className="font-condensed text-xl font-semibold text-text group-hover:text-accent">
                {l.label}
              </span>
              <span className="ml-3 text-sm text-text-muted">{l.desc}</span>
            </span>
            <span className="shrink-0 text-text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-accent">
              →
            </span>
          </Link>
        ))}
      </div>

      {topScorer && (
        <div className="mt-14 border-t border-border pt-6">
          <p className="text-sm text-gold">All-time leader</p>
          <p className="font-condensed mt-1 text-3xl font-bold text-text">{topScorer.displayName}</p>
          <p className="table-mono mt-1 text-sm text-text-muted">
            {fmtPoints(topScorer.pf)} career points · {topScorer.wins}-{topScorer.losses}
            {topScorer.ties > 0 ? `-${topScorer.ties}` : ""} · {topScorer.titles} title
            {topScorer.titles === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
