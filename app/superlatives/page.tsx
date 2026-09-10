import { getLatestCompletedWeek, getWeeklySuperlatives, getSeasonalSuperlatives } from "@/lib/superlatives";

export const dynamic = "force-dynamic";

export default function SuperlativesPage() {
  const latest = getLatestCompletedWeek();

  if (!latest) {
    return (
      <div className="py-14">
        <p className="text-sm text-text-muted">The league</p>
        <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Superlatives</h1>
        <p className="mt-4 text-text-muted">No completed week yet this season — check back once week 1 wraps.</p>
      </div>
    );
  }

  const weekly = getWeeklySuperlatives(latest);
  const seasonal = getSeasonalSuperlatives(latest.season, latest.leagueId);

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">The league</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Superlatives</h1>

      <div className="mt-10">
        <h2 className="font-condensed text-xl font-bold tracking-tight text-text">
          Week {latest.week}, {latest.season}
        </h2>
        <div className="mt-4 divide-y divide-border border-t border-border">
          {weekly.map((s) => (
            <div key={s.title} className="py-4">
              <p className="text-xs text-text-muted">{s.title}</p>
              <p className="mt-1 text-lg text-text">{s.copy}</p>
            </div>
          ))}
        </div>
      </div>

      {seasonal.length > 0 && (
        <div className="mt-12">
          <h2 className="font-condensed text-xl font-bold tracking-tight text-text">{latest.season} season</h2>
          <div className="mt-4 divide-y divide-border border-t border-border">
            {seasonal.map((s) => (
              <div key={s.title} className="py-4">
                <p className="text-xs text-text-muted">{s.title}</p>
                <p className="mt-1 text-lg text-text">{s.copy}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
