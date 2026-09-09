import Link from "next/link";
import { getCurrentLeague, getCurrentWeek, getSeasons } from "@/lib/league";
import { getManagerCareerStats } from "@/lib/stats";
import { fmtPoints } from "@/lib/format";

export const dynamic = "force-dynamic";

const QUICK_LINKS = [
  { href: "/matchups", label: "This Week's Matchups", desc: "Lineups, live scores, and storylines" },
  { href: "/standings", label: "Standings", desc: "Current record and all-time career stats" },
  { href: "/transactions", label: "Transactions", desc: "Every add, drop, waiver, and trade" },
];

export default function Home() {
  const league = getCurrentLeague();
  const week = getCurrentWeek();
  const seasons = getSeasons();
  const topScorer = [...getManagerCareerStats()].sort((a, b) => b.pf - a.pf)[0];

  return (
    <div className="py-10">
      <p className="font-condensed text-sm font-semibold uppercase tracking-widest text-accent">
        {league?.season ?? "—"} Season · Week {week}
      </p>
      <h1 className="font-condensed mt-2 text-5xl font-bold uppercase tracking-wide">
        {league?.name ?? "League Hub"}
      </h1>
      <p className="mt-3 max-w-xl text-text-muted">
        {seasons.length} season{seasons.length === 1 ? "" : "s"} of league history ingested from Sleeper, served from
        a local database — never fetched live on page load.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {QUICK_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-border bg-surface p-5 transition-colors hover:border-accent"
          >
            <p className="font-condensed text-lg font-bold uppercase tracking-wide">{l.label}</p>
            <p className="mt-1 text-sm text-text-muted">{l.desc}</p>
          </Link>
        ))}
      </div>

      {topScorer && (
        <div className="mt-10 rounded-lg border border-gold-dim bg-surface p-5">
          <p className="font-condensed text-xs font-semibold uppercase tracking-widest text-gold">All-time leader</p>
          <p className="font-condensed mt-1 text-3xl font-bold">{topScorer.displayName}</p>
          <p className="table-mono mt-1 text-text-muted">
            {fmtPoints(topScorer.pf)} career points · {topScorer.wins}-{topScorer.losses}
            {topScorer.ties > 0 ? `-${topScorer.ties}` : ""} · {topScorer.titles} title
            {topScorer.titles === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
