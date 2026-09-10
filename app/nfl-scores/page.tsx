import { getCurrentLeague } from "@/lib/league";
import { LiveScoreboard } from "@/components/LiveScoreboard";

export const dynamic = "force-dynamic";

export default function NflScoresPage() {
  const league = getCurrentLeague();

  if (!league) {
    return <div className="py-14 text-text-muted">No league data ingested yet. Run the ingest script.</div>;
  }

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">Live</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">NFL scores</h1>
      <p className="mt-3 max-w-xl text-text-muted">
        Real NFL scores and win probability for games with at least one currently rostered player, updated every
        30 seconds. Open a game to see live fantasy points for everyone in this league who plays in it.
      </p>

      <div className="mt-8">
        <LiveScoreboard leagueId={league.league_id} />
      </div>
    </div>
  );
}
