"use client";

import { useMemo, useState } from "react";
import type { NewsArticle } from "@/lib/news";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NewsFeed({ articles }: { articles: NewsArticle[] }) {
  const [team, setTeam] = useState("");

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const a of articles) {
      for (const p of a.players) if (p.team) set.add(p.team);
    }
    return Array.from(set).sort();
  }, [articles]);

  const filtered = useMemo(() => {
    if (!team) return articles;
    return articles.filter((a) => a.players.some((p) => p.team === team));
  }, [articles, team]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-text-muted" htmlFor="news-team-filter">
          Team
        </label>
        <select
          id="news-team-filter"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="border-b border-border bg-transparent py-1.5 pr-1 text-sm text-text focus:border-accent focus:outline-none"
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-sm text-text-dim">
          {filtered.length} article{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-6 divide-y divide-border border-t border-border">
        {filtered.length === 0 && <p className="py-6 text-text-muted">No articles for that team right now.</p>}
        {filtered.map((a) => (
          <a key={a.link} href={a.link} target="_blank" rel="noopener noreferrer" className="group block py-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span>{a.source}</span>
              {a.pubDate && (
                <>
                  <span>·</span>
                  <span>{formatDate(a.pubDate)}</span>
                </>
              )}
            </div>
            <p className="mt-1 text-text group-hover:text-accent">{a.title}</p>
            {a.players.length > 0 && (
              <p className="mt-1 text-sm text-text-dim">
                {a.players.map((p, i) => (
                  <span key={p.playerId}>
                    {i > 0 && ", "}
                    {p.name}
                    {p.team ? ` (${p.team})` : ""}
                    {p.managerName ? ` · ${p.managerName}` : ""}
                  </span>
                ))}
              </p>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
