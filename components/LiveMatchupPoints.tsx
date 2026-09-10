"use client";

import { useEffect, useState } from "react";
import type { LiveMatchup } from "@/lib/liveFantasy";
import { fmtPoints } from "@/lib/format";

const POLL_MS = 20000;

export function LiveMatchupPoints({
  leagueId,
  week,
  rosterA,
  rosterB,
}: {
  leagueId: string;
  week: number;
  rosterA: number;
  rosterB: number;
}) {
  const [data, setData] = useState<LiveMatchup | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/live/matchup?leagueId=${leagueId}&week=${week}&rosterA=${rosterA}&rosterB=${rosterB}`);
        if (!res.ok) throw new Error("bad response");
        const json = (await res.json()) as LiveMatchup;
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
  }, [leagueId, week, rosterA, rosterB]);

  if (error) return <p className="text-sm text-text-dim">Live scoring unavailable right now.</p>;
  if (!data) return <p className="text-sm text-text-dim">Loading live scoring...</p>;

  return (
    <div className="grid grid-cols-2 gap-6">
      {[data.teamA, data.teamB].map((team) => (
        <div key={team.rosterId}>
          <div className="mb-1 flex items-baseline justify-between border-b border-border pb-1">
            <p className="text-xs text-text-dim">{team.managerName}</p>
            <p className="table-mono text-sm font-semibold text-text">{fmtPoints(team.points)}</p>
          </div>
          {team.starters.map((p) => (
            <div key={p.playerId} className="flex items-center justify-between py-1 text-sm">
              <span className="truncate text-text-muted">
                <span className="table-mono mr-2 text-xs text-text-dim">{p.position}</span>
                {p.name}
                {p.team ? <span className="text-text-dim"> · {p.team}</span> : null}
              </span>
              <span className="table-mono shrink-0 pl-2">{fmtPoints(p.points)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
