import { NextResponse } from "next/server";
import { getLiveGamePlayers } from "@/lib/liveFantasy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get("leagueId");
  const week = Number(searchParams.get("week"));
  const home = searchParams.get("home");
  const away = searchParams.get("away");

  if (!leagueId || !week || !home || !away) {
    return NextResponse.json({ error: "leagueId, week, home, and away are required" }, { status: 400 });
  }

  try {
    const [homePlayers, awayPlayers] = await Promise.all([
      getLiveGamePlayers(leagueId, week, home),
      getLiveGamePlayers(leagueId, week, away),
    ]);
    return NextResponse.json({ home: homePlayers, away: awayPlayers });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
