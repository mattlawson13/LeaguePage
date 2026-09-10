"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { LetterResult } from "@/lib/wordle";

const MAX_GUESSES = 6;
const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

interface GuessRow {
  letters: string;
  result: LetterResult[];
}

interface SavedState {
  guesses: GuessRow[];
  status: "playing" | "won" | "lost";
}

const EMPTY_STATE: SavedState = { guesses: [], status: "playing" };

function storageKey(date: string): string {
  return `league-wordle:${date}`;
}

// Module-level cache so useSyncExternalStore's getSnapshot returns a stable
// reference across renders (required to avoid it being treated as always-
// changed) while still reading real localStorage state once mounted in the
// browser, mirroring the pattern ThemeToggle uses for the same class of
// browser-only-state problem.
const cache = new Map<string, SavedState>();
const listeners = new Set<() => void>();

function readState(date: string): SavedState {
  const cached = cache.get(date);
  if (cached) return cached;
  let state = EMPTY_STATE;
  try {
    const raw = localStorage.getItem(storageKey(date));
    if (raw) state = JSON.parse(raw) as SavedState;
  } catch {
    // best-effort only
  }
  cache.set(date, state);
  return state;
}

function writeState(date: string, state: SavedState) {
  cache.set(date, state);
  try {
    localStorage.setItem(storageKey(date), JSON.stringify(state));
  } catch {
    // best-effort only
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getServerSnapshot(): SavedState {
  return EMPTY_STATE;
}

function cellClass(result: LetterResult | undefined): string {
  if (result === "correct") return "border-win bg-win/20 text-text";
  if (result === "present") return "border-gold bg-gold/20 text-text";
  if (result === "absent") return "border-text-dim/40 bg-text-dim/10 text-text-muted";
  return "border-border text-text";
}

function keyClass(result: LetterResult | undefined): string {
  if (result === "correct") return "bg-win/30 text-text";
  if (result === "present") return "bg-gold/30 text-text";
  if (result === "absent") return "bg-text-dim/20 text-text-dim";
  return "bg-border text-text hover:bg-text-dim/20";
}

export function WordleGame({ date, wordLength }: { date: string; wordLength: number }) {
  const saved = useSyncExternalStore(subscribe, () => readState(date), getServerSnapshot);
  const { guesses, status } = saved;
  const [current, setCurrent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status !== "playing") {
      fetch(`/api/wordle/reveal?date=${encodeURIComponent(date)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.playerFullName) setReveal(data.playerFullName);
        })
        .catch(() => {});
    }
  }, [status, date]);

  const letterResults = useMemo(() => {
    const map = new Map<string, LetterResult>();
    const rank: Record<LetterResult, number> = { absent: 0, present: 1, correct: 2 };
    for (const g of guesses) {
      g.letters.split("").forEach((letter, i) => {
        const r = g.result[i];
        const existing = map.get(letter);
        if (!existing || rank[r] > rank[existing]) map.set(letter, r);
      });
    }
    return map;
  }, [guesses]);

  const submitGuess = useCallback(async () => {
    if (status !== "playing" || current.length !== wordLength || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/wordle/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, guess: current }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      const row: GuessRow = { letters: current.toUpperCase(), result: data.result };
      const nextGuesses = [...guesses, row];
      const nextStatus: SavedState["status"] = data.correct
        ? "won"
        : nextGuesses.length >= MAX_GUESSES
          ? "lost"
          : "playing";
      setCurrent("");
      writeState(date, { guesses: nextGuesses, status: nextStatus });
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [current, wordLength, status, submitting, date, guesses]);

  const pressKey = useCallback(
    (key: string) => {
      if (status !== "playing") return;
      if (key === "ENTER") {
        submitGuess();
        return;
      }
      if (key === "BACK") {
        setCurrent((c) => c.slice(0, -1));
        return;
      }
      setCurrent((c) => (c.length < wordLength ? c + key : c));
    },
    [status, wordLength, submitGuess],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") pressKey("ENTER");
      else if (e.key === "Backspace") pressKey("BACK");
      else if (/^[a-zA-Z]$/.test(e.key)) pressKey(e.key.toUpperCase());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pressKey]);

  const rows = Array.from({ length: MAX_GUESSES }, (_, i) => guesses[i] ?? null);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col gap-1.5">
        {rows.map((row, ri) => {
          const isCurrentRow = ri === guesses.length && status === "playing";
          const letters = row ? row.letters.split("") : isCurrentRow ? current.split("") : [];
          return (
            <div key={ri} className="flex gap-1.5">
              {Array.from({ length: wordLength }, (_, ci) => (
                <div
                  key={ci}
                  className={`font-condensed flex h-11 w-11 items-center justify-center rounded border text-lg font-bold uppercase ${cellClass(
                    row?.result[ci],
                  )}`}
                >
                  {letters[ci] ?? ""}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-loss">{error}</p>}

      {status === "won" && (
        <p className="text-center text-sm text-win">
          Nailed it{reveal ? `: ${reveal}` : ""}, in {guesses.length} guess{guesses.length === 1 ? "" : "es"}.
        </p>
      )}
      {status === "lost" && (
        <p className="text-center text-sm text-loss">
          Out of guesses{reveal ? `. It was ${reveal}` : ""}. Come back tomorrow.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {KEYBOARD_ROWS.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-1.5">
            {ri === 2 && (
              <button
                onClick={() => pressKey("ENTER")}
                className="rounded bg-border px-3 text-xs font-semibold text-text hover:bg-text-dim/20"
              >
                Enter
              </button>
            )}
            {row.split("").map((letter) => (
              <button
                key={letter}
                onClick={() => pressKey(letter)}
                className={`h-10 w-8 rounded text-sm font-semibold transition-colors ${keyClass(letterResults.get(letter))}`}
              >
                {letter}
              </button>
            ))}
            {ri === 2 && (
              <button
                onClick={() => pressKey("BACK")}
                className="rounded bg-border px-3 text-xs font-semibold text-text hover:bg-text-dim/20"
              >
                Del
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
