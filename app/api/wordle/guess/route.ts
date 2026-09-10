import { NextResponse } from "next/server";
import { getDailyAnswer, scoreGuess } from "@/lib/wordle";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { date?: string; guess?: string } | null;
  if (!body?.date || !body?.guess) {
    return NextResponse.json({ error: "date and guess are required" }, { status: 400 });
  }

  const answer = getDailyAnswer(body.date);
  if (!answer) return NextResponse.json({ error: "no answer for that date" }, { status: 404 });

  const guess = body.guess.toUpperCase().replace(/[^A-Z]/g, "");
  if (guess.length !== answer.word.length) {
    return NextResponse.json({ error: `guess must be ${answer.word.length} letters` }, { status: 400 });
  }

  const result = scoreGuess(guess, answer.word);
  const correct = guess === answer.word;
  return NextResponse.json({ result, correct });
}
