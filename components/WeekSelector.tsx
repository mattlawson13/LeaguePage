"use client";

import { useRouter } from "next/navigation";

export function WeekSelector({
  seasons,
  season,
  week,
  maxWeek = 18,
}: {
  seasons: string[];
  season: string;
  week: number;
  maxWeek?: number;
}) {
  const router = useRouter();
  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);

  function navigate(nextSeason: string, nextWeek: number) {
    router.push(`/matchups?season=${nextSeason}&week=${nextWeek}`);
  }

  const selectClass =
    "rounded border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none";

  return (
    <div className="flex flex-wrap gap-3">
      <select className={selectClass} value={season} onChange={(e) => navigate(e.target.value, week)}>
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select className={selectClass} value={week} onChange={(e) => navigate(season, Number(e.target.value))}>
        {weeks.map((w) => (
          <option key={w} value={w}>
            Week {w}
          </option>
        ))}
      </select>
    </div>
  );
}
