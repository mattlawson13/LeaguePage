import { getCurrentLeague, getCurrentWeek, getLeagueForSeason, getSeasons } from "@/lib/league";
import { getWeekMatchups } from "@/lib/matchups";
import { getMatchupArticle } from "@/lib/beatWriter";
import { WeekSelector } from "@/components/WeekSelector";
import { MatchupCard } from "@/components/MatchupCard";

export const dynamic = "force-dynamic";

export default async function MatchupsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; week?: string }>;
}) {
  const params = await searchParams;
  const currentLeague = getCurrentLeague();
  const seasons = getSeasons();

  const season = params.season ?? currentLeague?.season ?? seasons[0];
  const week = params.week ? Number(params.week) : getCurrentWeek();

  const league = season === currentLeague?.season ? currentLeague : getLeagueForSeason(season);

  if (!league) {
    return <div className="py-10 text-text-muted">No league data ingested yet. Run the ingest script.</div>;
  }

  const matchups = getWeekMatchups(league.league_id, week);

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">{season} season</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Matchups</h1>

      <div className="mt-6">
        <WeekSelector seasons={seasons} season={season} week={week} />
      </div>

      <div className="mt-8 divide-y divide-border border-t border-border">
        {matchups.length === 0 && <p className="py-6 text-text-muted">No matchups recorded for this week yet.</p>}
        {matchups.map((m) => {
          const played = m.teams.every((t) => t.points > 0);
          const article = played ? getMatchupArticle(m, league.league_id, season, week) : null;
          return <MatchupCard key={m.matchupId} teams={m.teams} article={article} />;
        })}
      </div>
    </div>
  );
}
