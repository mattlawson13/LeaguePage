"use client";

import { useState } from "react";
import Image from "next/image";
import type { MatchupTeam } from "@/lib/matchups";
import { avatarUrl, fmtPoints } from "@/lib/format";
import { managerColor } from "@/lib/managerColors";

function TeamHeader({ team, isWinner }: { team: MatchupTeam; isWinner: boolean }) {
  const src = avatarUrl(team.avatar);
  const color = team.userId ? managerColor(team.userId) : "#666";
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2"
        style={{ borderColor: color }}
      >
        {src ? (
          <Image src={src} alt={team.managerName} width={40} height={40} unoptimized />
        ) : (
          <span className="font-condensed text-sm font-bold" style={{ color }}>
            {team.managerName.slice(0, 1)}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className={`truncate font-semibold ${isWinner ? "text-text" : "text-text-muted"}`}>{team.managerName}</p>
      </div>
    </div>
  );
}

function PlayerRow({ playerId, name, position, team, points }: { playerId: string; name: string; position: string; team: string | null; points: number }) {
  return (
    <div key={playerId} className="flex items-center justify-between py-1 text-sm">
      <span className="truncate text-text-muted">
        <span className="table-mono mr-2 text-xs text-text-dim">{position}</span>
        {name}
        {team ? <span className="text-text-dim"> · {team}</span> : null}
      </span>
      <span className="table-mono shrink-0 pl-2">{fmtPoints(points)}</span>
    </div>
  );
}

export function MatchupCard({ teams }: { teams: MatchupTeam[] }) {
  const [showBench, setShowBench] = useState(false);
  const [teamA, teamB] = teams;
  if (!teamA || !teamB) return null;
  const aWins = teamA.points > teamB.points;
  const bWins = teamB.points > teamA.points;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <TeamHeader team={teamA} isWinner={aWins} />
          <p className={`font-condensed mt-2 text-3xl font-bold stat-num ${aWins ? "text-accent" : "text-text-muted"}`}>
            {fmtPoints(teamA.points)}
          </p>
        </div>
        <div className="text-right">
          <div className="flex flex-row-reverse">
            <TeamHeader team={teamB} isWinner={bWins} />
          </div>
          <p className={`font-condensed mt-2 text-3xl font-bold stat-num ${bWins ? "text-accent" : "text-text-muted"}`}>
            {fmtPoints(teamB.points)}
          </p>
        </div>
      </div>

      <button
        onClick={() => setShowBench((v) => !v)}
        className="font-condensed mt-4 w-full rounded border border-border py-2 text-xs font-semibold uppercase tracking-wide text-text-muted transition-colors hover:border-accent hover:text-accent"
      >
        {showBench ? "Hide lineups" : "Show lineups"}
      </button>

      {showBench && (
        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <p className="font-condensed mb-1 text-xs font-semibold uppercase tracking-wide text-text-dim">Starters</p>
            {teamA.starters.map((p) => (
              <PlayerRow key={p.playerId} {...p} />
            ))}
            <p className="font-condensed mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-text-dim">Bench</p>
            {teamA.bench.map((p) => (
              <PlayerRow key={p.playerId} {...p} />
            ))}
          </div>
          <div>
            <p className="font-condensed mb-1 text-xs font-semibold uppercase tracking-wide text-text-dim">Starters</p>
            {teamB.starters.map((p) => (
              <PlayerRow key={p.playerId} {...p} />
            ))}
            <p className="font-condensed mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-text-dim">Bench</p>
            {teamB.bench.map((p) => (
              <PlayerRow key={p.playerId} {...p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
