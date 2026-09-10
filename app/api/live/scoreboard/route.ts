import { NextResponse } from "next/server";
import { getLiveScoreboard, getRosteredNflTeams } from "@/lib/liveScores";
import { getNflState } from "@/lib/league";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get("leagueId");

  const state = getNflState();
  if (!state) return NextResponse.json({ games: [] });

  try {
    const games = await getLiveScoreboard(state.season, state.week);
    const relevant = leagueId ? getRosteredNflTeams(leagueId) : null;
    const filtered = relevant
      ? games.filter((g) => relevant.has(g.homeTeam) || relevant.has(g.awayTeam))
      : games;
    return NextResponse.json({ games: filtered, season: state.season, week: state.week });
  } catch {
    return NextResponse.json({ games: [], error: "unavailable" }, { status: 502 });
  }
}
