"use client";

import { useState } from "react";
import type { MatchupTeam } from "@/lib/matchups";
import type { MatchupArticle } from "@/lib/beatWriter";
import { avatarUrl, fmtPoints } from "@/lib/format";
import { managerColor } from "@/lib/managerColors";
import { CdnImage } from "./CdnImage";
import { LiveMatchupPoints } from "./LiveMatchupPoints";

function TeamHeader({ team, isWinner, align }: { team: MatchupTeam; isWinner: boolean; align: "left" | "right" }) {
  const src = avatarUrl(team.avatar);
  const color = team.userId ? managerColor(team.userId) : "var(--color-text-dim)";
  const avatarEl = (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-base">
      {src ? (
        <CdnImage src={src} alt="" width={32} height={32} unoptimized />
      ) : (
        <span className="text-xs text-text-dim">{team.managerName.slice(0, 1)}</span>
      )}
    </div>
  );
  const nameEl = (
    <p className={`truncate text-sm ${isWinner ? "text-text" : "text-text-muted"}`}>{team.managerName}</p>
  );
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      {avatarEl}
      {nameEl}
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

export function MatchupCard({
  teams,
  article,
  articleKind = "recap",
  live,
}: {
  teams: MatchupTeam[];
  article?: MatchupArticle | null;
  articleKind?: "recap" | "preview";
  live?: { leagueId: string; week: number } | null;
}) {
  const [showBench, setShowBench] = useState(false);
  const [showArticle, setShowArticle] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const [teamA, teamB] = teams;
  if (!teamA || !teamB) return null;
  const aWins = teamA.points > teamB.points;
  const bWins = teamB.points > teamA.points;

  return (
    <div className="py-5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamHeader team={teamA} isWinner={aWins} align="left" />
        <div className="flex items-baseline gap-2 px-2">
          <span className={`font-condensed stat-num text-2xl font-bold ${aWins ? "text-text" : "text-text-dim"}`}>
            {fmtPoints(teamA.points)}
          </span>
          <span className="text-xs text-text-dim">–</span>
          <span className={`font-condensed stat-num text-2xl font-bold ${bWins ? "text-text" : "text-text-dim"}`}>
            {fmtPoints(teamB.points)}
          </span>
        </div>
        <TeamHeader team={teamB} isWinner={bWins} align="right" />
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <button
          onClick={() => setShowBench((v) => !v)}
          className="text-sm text-text-muted underline decoration-border underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
        >
          {showBench ? "Hide lineups" : "Show lineups"}
        </button>
        {article && (
          <button
            onClick={() => setShowArticle((v) => !v)}
            className="text-sm text-text-muted underline decoration-border underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
          >
            {showArticle
              ? articleKind === "preview"
                ? "Hide preview"
                : "Hide recap"
              : articleKind === "preview"
                ? "Read the preview"
                : "Read the recap"}
          </button>
        )}
        {live && (
          <button
            onClick={() => setShowLive((v) => !v)}
            className="text-sm text-text-muted underline decoration-border underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
          >
            {showLive ? "Hide live scoring" : "Live scoring"}
          </button>
        )}
      </div>

      {showLive && live && (
        <div className="mt-4">
          <LiveMatchupPoints leagueId={live.leagueId} week={live.week} rosterA={teamA.rosterId} rosterB={teamB.rosterId} />
        </div>
      )}

      {showArticle && article && (
        <div className="mt-4 max-w-2xl border-l-2 border-border pl-4">
          <p className="font-condensed text-lg font-semibold text-text">{article.headline}</p>
          <div className="mt-2 flex flex-col gap-2">
            {article.paragraphs.map((p, i) => (
              <p key={i} className="text-sm text-text-muted">
                {p}
              </p>
            ))}
          </div>
        </div>
      )}

      {showBench && (
        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <p className="mb-1 text-xs text-text-dim">Starters</p>
            {teamA.starters.map((p) => (
              <PlayerRow key={p.playerId} {...p} />
            ))}
            <p className="mb-1 mt-3 text-xs text-text-dim">Bench</p>
            {teamA.bench.map((p) => (
              <PlayerRow key={p.playerId} {...p} />
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs text-text-dim">Starters</p>
            {teamB.starters.map((p) => (
              <PlayerRow key={p.playerId} {...p} />
            ))}
            <p className="mb-1 mt-3 text-xs text-text-dim">Bench</p>
            {teamB.bench.map((p) => (
              <PlayerRow key={p.playerId} {...p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
