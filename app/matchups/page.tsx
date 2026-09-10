import { getCurrentLeague, getCurrentWeek, getLeagueForSeason, getSeasons, isWeekFinal } from "@/lib/league";
import { getWeekMatchups } from "@/lib/matchups";
import { getMatchupArticle, getMatchupPreview } from "@/lib/beatWriter";
import { getPlayerHistory } from "@/lib/players";
import { WeekSelector } from "@/components/WeekSelector";
import { MatchupCard } from "@/components/MatchupCard";
import { LiveScoreboard } from "@/components/LiveScoreboard";

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
  const weekFinal = isWeekFinal(season, week);
  const careerPointsById = weekFinal
    ? null
    : new Map(getPlayerHistory().map((p) => [p.playerId, p.careerPoints]));

  // Live NFL scores and live per-player fantasy points only make sense for
  // whatever week the actual NFL season is on right now, not a past week
  // being browsed or a future one that hasn't happened yet.
  const isLiveWeek = season === currentLeague?.season && week === getCurrentWeek();

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">{season} season</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Matchups</h1>

      <div className="mt-6">
        <WeekSelector seasons={seasons} season={season} week={week} />
      </div>

      {isLiveWeek && (
        <div className="mt-8">
          <LiveScoreboard leagueId={league.league_id} />
        </div>
      )}

      <div className="mt-8 divide-y divide-border border-t border-border">
        {matchups.length === 0 && <p className="py-6 text-text-muted">No matchups recorded for this week yet.</p>}
        {matchups.map((m) => {
          const article = weekFinal
            ? getMatchupArticle(m, league.league_id, season, week)
            : getMatchupPreview(m, league.league_id, season, week, careerPointsById!);
          return (
            <MatchupCard
              key={m.matchupId}
              teams={m.teams}
              article={article}
              articleKind={weekFinal ? "recap" : "preview"}
              live={isLiveWeek ? { leagueId: league.league_id, week } : null}
            />
          );
        })}
      </div>
    </div>
  );
}
