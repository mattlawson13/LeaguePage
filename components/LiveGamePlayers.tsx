"use client";

import { useEffect, useState } from "react";
import type { LiveGamePlayer } from "@/lib/liveFantasy";
import { fmtPoints } from "@/lib/format";

const POLL_MS = 20000;

interface GamePlayersResponse {
  home: LiveGamePlayer[];
  away: LiveGamePlayer[];
}

function PlayerColumn({ team, players }: { team: string; players: LiveGamePlayer[] }) {
  return (
    <div>
      <p className="mb-1 text-xs text-text-dim">{team}</p>
      {players.length === 0 && <p className="text-sm text-text-dim">Nobody in this league has a {team} player.</p>}
      {players.map((p) => (
        <div key={p.playerId} className="flex items-center justify-between py-1 text-sm">
          <span className="truncate text-text-muted">
            <span className="table-mono mr-2 text-xs text-text-dim">{p.position}</span>
            {p.name}
            {p.managerName ? <span className="text-text-dim"> · {p.managerName}</span> : null}
          </span>
          <span className="table-mono shrink-0 pl-2">{fmtPoints(p.points)}</span>
        </div>
      ))}
    </div>
  );
}

export function LiveGamePlayers({
  leagueId,
  week,
  homeTeam,
  awayTeam,
}: {
  leagueId: string;
  week: number;
  homeTeam: string;
  awayTeam: string;
}) {
  const [data, setData] = useState<GamePlayersResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(
          `/api/live/game-players?leagueId=${leagueId}&week=${week}&home=${homeTeam}&away=${awayTeam}`,
        );
        if (!res.ok) throw new Error("bad response");
        const json = (await res.json()) as GamePlayersResponse;
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
  }, [leagueId, week, homeTeam, awayTeam]);

  if (error) return <p className="py-3 text-sm text-text-dim">Fantasy points unavailable right now.</p>;
  if (!data) return <p className="py-3 text-sm text-text-dim">Loading fantasy points...</p>;

  return (
    <div className="grid grid-cols-2 gap-6 py-3">
      <PlayerColumn team={awayTeam} players={data.away} />
      <PlayerColumn team={homeTeam} players={data.home} />
    </div>
  );
}
