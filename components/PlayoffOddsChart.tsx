"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import type { PlayoffOddsHistoryPoint } from "@/lib/playoffOdds";
import { managerColor } from "@/lib/managerColors";

export function PlayoffOddsChart({ history }: { history: PlayoffOddsHistoryPoint[] }) {
  const weeks = Array.from(new Set(history.map((h) => h.week))).sort((a, b) => a - b);
  const rosters = Array.from(new Map(history.map((h) => [h.rosterId, h])).values());

  const data = weeks.map((week) => {
    const row: Record<string, number | string> = { week: `Wk ${week}` };
    for (const r of rosters) {
      const point = history.find((h) => h.week === week && h.rosterId === r.rosterId);
      row[r.displayName] = point ? Math.round(point.makePlayoffsPct * 10) / 10 : NaN;
    }
    return row;
  });

  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="week" tick={{ fill: "var(--color-text-muted)", fontSize: 12 }} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 0,
              fontSize: 13,
            }}
            formatter={(value) => [`${value}%`, ""]}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-text-muted)" }} iconSize={8} iconType="circle" />
          {rosters.map((r) => (
            <Line
              key={r.rosterId}
              type="monotone"
              dataKey={r.displayName}
              stroke={r.userId ? managerColor(r.userId) : "var(--color-text-dim)"}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
