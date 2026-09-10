"use client";

import { useMemo, useState } from "react";
import type { PlayerHistoryRow } from "@/lib/players";
import { fmtPoints } from "@/lib/format";

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

export function PlayerSearch({ players }: { players: PlayerHistoryRow[] }) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (position && p.position !== position) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [players, query, position]);

  const selectClass = "border-b border-border bg-transparent py-1.5 pr-1 text-sm text-text focus:border-accent focus:outline-none";

  return (
    <div>
      <div className="flex flex-wrap gap-5">
        <input
          type="text"
          placeholder="Search players…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-56 border-b border-border bg-transparent py-1.5 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
        />
        <select className={selectClass} value={position} onChange={(e) => setPosition(e.target.value)}>
          <option value="">All positions</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="self-center text-sm text-text-dim">{filtered.length} players</span>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-text-dim/40 text-left text-text-muted">
              <th className="py-2 pr-2 font-normal">Player</th>
              <th className="py-2 pr-2 font-normal">Pos</th>
              <th className="py-2 pr-2 font-normal">Team</th>
              <th className="py-2 pr-2 font-normal">Current manager</th>
              <th className="table-mono py-2 pr-2 text-right font-normal">Career pts</th>
              <th className="table-mono py-2 pr-2 text-right font-normal">Drafted</th>
              <th className="table-mono py-2 text-right font-normal">Traded</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 300).map((p) => (
              <tr key={p.playerId} className="border-b border-border">
                <td className="py-2 pr-2 text-text">{p.name}</td>
                <td className="table-mono py-2 pr-2 text-text-dim">{p.position}</td>
                <td className="table-mono py-2 pr-2 text-text-muted">{p.team ?? "—"}</td>
                <td className="py-2 pr-2 text-text-muted">{p.currentManager ?? "—"}</td>
                <td className="table-mono py-2 pr-2 text-right text-text">{fmtPoints(p.careerPoints)}</td>
                <td className="table-mono py-2 pr-2 text-right text-text-muted">{p.timesDrafted || "—"}</td>
                <td className="table-mono py-2 text-right text-text-muted">{p.timesTraded || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 300 && (
          <p className="mt-3 text-sm text-text-dim">Showing the top 300 of {filtered.length} — narrow your search to see more.</p>
        )}
      </div>
    </div>
  );
}
