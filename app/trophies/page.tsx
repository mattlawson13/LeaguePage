import Link from "next/link";
import awardsFile from "@/data/awards.json";
import { getChampions, getToiletBowls, getBestSeasonWithoutTitle, getMostBenchPointsSeason } from "@/lib/trophies";
import type { AwardsFile } from "@/lib/trophies";
import { managerHref, resolveManagers } from "@/lib/managers";
import { fmtPoints } from "@/lib/format";

export const dynamic = "force-dynamic";

const awards = awardsFile as AwardsFile;

function userIdToHref(userId: string, managers: ReturnType<typeof resolveManagers>): string | null {
  const m = managers.find((mm) => mm.userId === userId);
  return m ? managerHref(m.sleeper_username) : null;
}

export default function TrophiesPage() {
  const managers = resolveManagers();
  const champions = getChampions();
  const toiletBowls = getToiletBowls();
  const bestWithoutTitle = getBestSeasonWithoutTitle();
  const mostBenchPoints = getMostBenchPointsSeason();

  const autoResults: Record<string, { season: string; userId: string; displayName: string; value?: number }[]> = {
    champion: champions,
    toilet_bowl: toiletBowls,
    most_pf_no_title: bestWithoutTitle ? [bestWithoutTitle] : [],
    bench_regret: mostBenchPoints ? [mostBenchPoints] : [],
  };

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">The league</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Trophy room</h1>

      {champions.length > 0 && (
        <div className="mt-10">
          <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Championships</h2>
          <div className="mt-2 divide-y divide-border border-t border-border">
            {champions.map((c) => {
              const href = userIdToHref(c.userId, managers);
              return (
                <div key={c.season} className="flex items-center justify-between py-3">
                  <span className="table-mono text-text-dim">{c.season}</span>
                  {href ? (
                    <Link href={href} className="text-gold hover:text-accent">
                      {c.displayName}
                    </Link>
                  ) : (
                    <span className="text-gold">{c.displayName}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-12">
        <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Joke trophies</h2>
        <div className="mt-2 divide-y divide-border border-t border-border">
          {awards._schema.definitions
            .filter((d) => d.id !== "champion")
            .map((def) => {
              if (def.type === "manual") {
                const entries = awards.manualAwards[def.id] ?? {};
                const seasons = Object.keys(entries).sort().reverse();
                return (
                  <div key={def.id} className="py-4">
                    <p className="text-text">{def.name}</p>
                    <p className="text-sm text-text-muted">{def.description}</p>
                    {seasons.length === 0 ? (
                      <p className="mt-1 text-sm text-text-dim">Not yet voted.</p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {seasons.map((season) => (
                          <p key={season} className="table-mono text-sm text-text-muted">
                            {season} — {entries[season].winner}
                            {entries[season].note ? ` (${entries[season].note})` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              const results = autoResults[def.id] ?? [];
              return (
                <div key={def.id} className="py-4">
                  <p className="text-text">{def.name}</p>
                  <p className="text-sm text-text-muted">{def.description}</p>
                  {results.length === 0 ? (
                    <p className="mt-1 text-sm text-text-dim">Not enough data yet.</p>
                  ) : (
                    <div className="mt-2 space-y-1">
                      {results.map((r, i) => {
                        const href = userIdToHref(r.userId, managers);
                        return (
                          <p key={`${r.season}-${i}`} className="table-mono text-sm">
                            <span className="text-text-dim">{r.season} — </span>
                            {href ? (
                              <Link href={href} className="text-text hover:text-accent">
                                {r.displayName}
                              </Link>
                            ) : (
                              <span className="text-text">{r.displayName}</span>
                            )}
                            {r.value !== undefined ? (
                              <span className="text-text-muted"> ({fmtPoints(r.value)})</span>
                            ) : null}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
