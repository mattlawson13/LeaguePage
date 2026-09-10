import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getCurrentlyRosteredPlayerNames } from "./news";

export interface WordleAnswer {
  word: string;
  playerFullName: string;
}

function seedForDate(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (h << 5) - h + dateStr.charCodeAt(i);
  return Math.abs(h);
}

function lastNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function cleanWord(name: string): string {
  return name.toUpperCase().replace(/[^A-Z]/g, "");
}

/**
 * Deterministic "word of the day" drawn from players currently rostered in
 * this league, so the answer is always someone your league actually
 * drafted, not a random NFL name. Same date always resolves to the same
 * word (no persisted "today's answer" row needed).
 */
export function getDailyAnswer(dateStr: string, db: Database = getDb()): WordleAnswer | null {
  const players = getCurrentlyRosteredPlayerNames(db);
  const candidates = players
    .map((p) => ({ playerFullName: p.fullName, word: cleanWord(lastNameOf(p.fullName)) }))
    .filter((c) => c.word.length >= 4 && c.word.length <= 8);
  if (candidates.length === 0) return null;

  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    if (seen.has(c.word)) return false;
    seen.add(c.word);
    return true;
  });

  const idx = seedForDate(dateStr) % unique.length;
  return unique[idx];
}

export type LetterResult = "correct" | "present" | "absent";

/** Standard Wordle scoring: exact positions first, then leftover letters matched against unused answer letters. */
export function scoreGuess(guess: string, answer: string): LetterResult[] {
  const g = guess.toUpperCase();
  const a = answer.toUpperCase();
  const result: LetterResult[] = new Array(g.length).fill("absent");
  const answerLetters = a.split("");
  const used = new Array(a.length).fill(false);

  for (let i = 0; i < g.length; i++) {
    if (g[i] === answerLetters[i]) {
      result[i] = "correct";
      used[i] = true;
    }
  }
  for (let i = 0; i < g.length; i++) {
    if (result[i] === "correct") continue;
    const idx = answerLetters.findIndex((ch, j) => ch === g[i] && !used[j]);
    if (idx !== -1) {
      result[i] = "present";
      used[idx] = true;
    }
  }
  return result;
}
