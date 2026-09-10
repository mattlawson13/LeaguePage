import { NextResponse } from "next/server";
import { getLiveMatchup } from "@/lib/liveFantasy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get("leagueId");
  const week = Number(searchParams.get("week"));
  const rosterA = Number(searchParams.get("rosterA"));
  const rosterB = Number(searchParams.get("rosterB"));

  if (!leagueId || !week || !rosterA || !rosterB) {
    return NextResponse.json({ error: "leagueId, week, rosterA, and rosterB are required" }, { status: 400 });
  }

  try {
    const matchup = await getLiveMatchup(leagueId, week, rosterA, rosterB);
    if (!matchup) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(matchup);
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
