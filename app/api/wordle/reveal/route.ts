import { NextResponse } from "next/server";
import { getDailyAnswer } from "@/lib/wordle";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

  const answer = getDailyAnswer(date);
  if (!answer) return NextResponse.json({ error: "no answer for that date" }, { status: 404 });

  return NextResponse.json({ word: answer.word, playerFullName: answer.playerFullName });
}
