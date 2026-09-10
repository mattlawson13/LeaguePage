"use client";

import { useEffect, useState } from "react";
import type { LiveGame } from "@/lib/liveScores";
import { LiveGamePlayers } from "./LiveGamePlayers";

const POLL_MS = 30000;

interface ScoreboardResponse {
  games: LiveGame[];
  season?: string;
  week?: number;
}

export function LiveScoreboard({ leagueId }: { leagueId: string }) {
  const [data, setData] = useState<ScoreboardResponse | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/live/scoreboard?leagueId=${leagueId}`);
        if (!res.ok) throw new Error("bad response");
        const json = (await res.json()) as ScoreboardResponse;
        if (!cancelled) {
          setData(json);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [leagueId]);

  if (error) return <p className="py-3 text-sm text-text-dim">Live scores unavailable right now.</p>;
  if (!data) return <p className="py-3 text-sm text-text-dim">Loading live scores...</p>;
  if (data.games.length === 0) return <p className="py-3 text-sm text-text-dim">No games featuring this league&apos;s rostered players right now.</p>;

  return (
    <div className="divide-y divide-border border-y border-border">
      {data.games.map((g) => {
        const awayLeads = g.state !== "pre" && g.awayScore >= g.homeScore;
        const homeLeads = g.state !== "pre" && g.homeScore >= g.awayScore;
        const isExpanded = expanded === g.espnEventId;
        return (
          <div key={g.espnEventId} className="py-2.5">
            <button
              onClick={() => setExpanded(isExpanded ? null : g.espnEventId)}
              className="flex w-full flex-wrap items-center justify-between gap-3 text-left text-sm"
            >
              <div className="table-mono flex items-baseline gap-2">
                <span className={awayLeads ? "text-text" : "text-text-muted"}>{g.awayTeam}</span>
                {g.state !== "pre" && <span className="text-text">{g.awayScore}</span>}
                <span className="text-text-dim">@</span>
                <span className={homeLeads ? "text-text" : "text-text-muted"}>{g.homeTeam}</span>
                {g.state !== "pre" && <span className="text-text">{g.homeScore}</span>}
              </div>
              <div className="flex items-center gap-3">
                {g.homeWinPct !== null && g.awayWinPct !== null && (
                  <div
                    className="flex h-1.5 w-20 overflow-hidden rounded-full"
                    title={`${g.awayTeam} ${g.awayWinPct.toFixed(0)}% / ${g.homeTeam} ${g.homeWinPct.toFixed(0)}%`}
                  >
                    <div className="h-full bg-text-dim/40" style={{ width: `${g.awayWinPct}%` }} />
                    <div className="h-full bg-accent" style={{ width: `${g.homeWinPct}%` }} />
                  </div>
                )}
                <span className="text-xs text-text-dim">{g.statusDetail}</span>
                <span className="text-xs text-text-dim underline decoration-border underline-offset-4">
                  {isExpanded ? "Hide" : "Fantasy points"}
                </span>
              </div>
            </button>
            {isExpanded && data.week && (
              <LiveGamePlayers leagueId={leagueId} week={data.week} homeTeam={g.homeTeam} awayTeam={g.awayTeam} />
            )}
          </div>
        );
      })}
    </div>
  );
}
