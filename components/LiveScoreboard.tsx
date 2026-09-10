"use client";

import { useEffect, useState } from "react";
import type { LiveGame } from "@/lib/liveScores";

const POLL_MS = 30000;

export function LiveScoreboard({ leagueId }: { leagueId: string }) {
  const [games, setGames] = useState<LiveGame[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/live/scoreboard?leagueId=${leagueId}`);
        if (!res.ok) throw new Error("bad response");
        const data = (await res.json()) as { games: LiveGame[] };
        if (!cancelled) {
          setGames(data.games);
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
  if (!games) return <p className="py-3 text-sm text-text-dim">Loading live scores...</p>;
  if (games.length === 0) return null;

  return (
    <div className="divide-y divide-border border-y border-border">
      {games.map((g) => {
        const awayLeads = g.state !== "pre" && g.awayScore >= g.homeScore;
        const homeLeads = g.state !== "pre" && g.homeScore >= g.awayScore;
        return (
          <div key={g.espnEventId} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
