import { notFound } from "next/navigation";
import {
  resolveManagers,
  getManagerByUsername,
  getAllTimeRecord,
  getManagerSeasonHistory,
  getManagerCurrentRoster,
  getManagerDraftTendencies,
  getManagerRivalries,
  managerHref,
} from "@/lib/managers";
import { findPlayerByName, teamLogoUrl } from "@/lib/playerLookup";
import { avatarUrl, fmtPoints, fmtRecord, ordinal } from "@/lib/format";
import { managerColor } from "@/lib/managerColors";
import { CdnImage } from "@/components/CdnImage";
import Link from "next/link";

export const dynamic = "force-dynamic";

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="font-condensed text-3xl font-bold stat-num" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      <p className="font-condensed text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}

export default async function ManagerBioPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const allManagers = resolveManagers();
  const manager = getManagerByUsername(username);
  if (!manager) notFound();

  const color = managerColor(manager.userId);
  const avatarSrc = avatarUrl(manager.avatar);
  const record = getAllTimeRecord(manager.userId);
  const seasonHistory = getManagerSeasonHistory(manager.userId);
  const roster = getManagerCurrentRoster(manager.userId);
  const draft = getManagerDraftTendencies(manager.userId);
  const rivalries = getManagerRivalries(manager, allManagers);

  const favoritePlayer = manager.favorite_player ? findPlayerByName(manager.favorite_player) : null;
  const favoriteTeamLogo = manager.favorite_team ? teamLogoUrl(manager.favorite_team) : null;
  const hasFavorites = favoritePlayer || favoriteTeamLogo;

  return (
    <div className="py-10">
      {/* 1. Header */}
      <div className="flex items-center gap-5">
        <div
          className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4"
          style={{ borderColor: color }}
        >
          {avatarSrc ? (
            <CdnImage src={avatarSrc} alt={manager.display_name} width={96} height={96} unoptimized />
          ) : (
            <span className="font-condensed text-4xl font-bold" style={{ color }}>
              {manager.display_name.slice(0, 1)}
            </span>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-condensed text-4xl font-bold uppercase tracking-wide">{manager.display_name}</h1>
            {manager.role === "commissioner" && (
              <span className="font-condensed rounded border border-gold-dim px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-gold">
                Commissioner
              </span>
            )}
          </div>
          <p className="mt-1 text-text-muted">{manager.real_name}</p>
        </div>
      </div>

      {/* 2. All-time record */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Record" value={fmtRecord(record.wins, record.losses, record.ties)} accent={color} />
        <StatTile label="Win %" value={`${(record.winPct * 100).toFixed(1)}%`} />
        <StatTile label="Points For" value={fmtPoints(record.pf)} />
        <StatTile label="Points Against" value={fmtPoints(record.pa)} />
        <StatTile label="Point Diff" value={`${record.diff >= 0 ? "+" : ""}${fmtPoints(record.diff)}`} />
        <StatTile label="Avg PPG" value={fmtPoints(record.avgPpg)} />
        <StatTile label="Seasons Played" value={String(record.seasonsPlayed)} />
        <StatTile label="Playoff W-L" value={`${record.playoffWins}-${record.playoffLosses}`} />
        <StatTile label="Championships" value={String(record.championships)} accent={record.championships > 0 ? "#c9a24b" : undefined} />
        <StatTile label="Runner-ups" value={String(record.runnerUps)} />
        <StatTile label="Last Place" value={String(record.lastPlaceFinishes)} />
        {record.bestSeasonFinish && <StatTile label="Best Finish" value={ordinal(record.bestSeasonFinish)} />}
        {record.worstSeasonFinish && <StatTile label="Worst Finish" value={ordinal(record.worstSeasonFinish)} />}
        {record.bestWeek && (
          <StatTile label={`Best Week (${record.bestWeek.season} Wk ${record.bestWeek.week})`} value={fmtPoints(record.bestWeek.points)} />
        )}
        {record.worstWeek && (
          <StatTile label={`Worst Week (${record.worstWeek.season} Wk ${record.worstWeek.week})`} value={fmtPoints(record.worstWeek.points)} />
        )}
      </div>

      {/* 3. Bio */}
      {manager.bio && <p className="mt-8 max-w-2xl text-lg leading-relaxed text-text">{manager.bio}</p>}

      {/* 4. Favorites strip */}
      {hasFavorites && (
        <div className="mt-8 flex flex-wrap items-center gap-6">
          {favoritePlayer && (
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
                <CdnImage
                  src={favoritePlayer.portraitUrl}
                  alt={favoritePlayer.fullName}
                  width={80}
                  height={80}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="font-condensed text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Favorite Player
                </p>
                <p className="font-semibold">{favoritePlayer.fullName}</p>
              </div>
            </div>
          )}
          {favoriteTeamLogo && (
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden p-2">
                <CdnImage
                  src={favoriteTeamLogo}
                  alt={manager.favorite_team ?? ""}
                  width={64}
                  height={64}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <p className="font-condensed text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Favorite Team
                </p>
                <p className="font-semibold">{manager.favorite_team}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Rivalries */}
      {rivalries.length > 0 && (
        <div className="mt-10">
          <h2 className="font-condensed text-2xl font-bold uppercase tracking-wide">Rivalries</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {rivalries.map((card, i) =>
              card.kind === "self" ? (
                <div
                  key={`self-${i}`}
                  className="rounded-lg border-2 border-dashed border-accent bg-accent-dim/20 p-4"
                >
                  <p className="font-condensed text-xs font-semibold uppercase tracking-wide text-accent">
                    His own worst enemy
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    {avatarSrc ? (
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2" style={{ borderColor: color }}>
                        <CdnImage src={avatarSrc} alt={manager.display_name} width={48} height={48} unoptimized />
                      </div>
                    ) : null}
                    <p className="font-condensed text-2xl font-bold">{manager.display_name} vs. {manager.display_name}</p>
                  </div>
                </div>
              ) : (
                <div key={card.rival.userId} className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {avatarUrl(card.rival.avatar) ? (
                        <div
                          className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2"
                          style={{ borderColor: managerColor(card.rival.userId) }}
                        >
                          <CdnImage
                            src={avatarUrl(card.rival.avatar)!}
                            alt={card.rival.display_name}
                            width={40}
                            height={40}
                            unoptimized
                          />
                        </div>
                      ) : null}
                      <Link href={managerHref(card.rival.sleeper_username)} className="font-semibold hover:text-accent">
                        {card.rival.display_name}
                      </Link>
                    </div>
                    {card.houseDivided && (
                      <span className="font-condensed shrink-0 rounded border border-gold-dim px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                        House Divided
                      </span>
                    )}
                  </div>
                  {card.headToHead ? (
                    <p className="table-mono mt-3 text-sm text-text-muted">
                      {fmtRecord(card.headToHead.wins, card.headToHead.losses, card.headToHead.ties)} all-time ·{" "}
                      {card.headToHead.avgMargin >= 0 ? "+" : ""}
                      {fmtPoints(card.headToHead.avgMargin)} avg margin
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-text-muted">Haven&apos;t played yet.</p>
                  )}
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {/* 6. Career table */}
      {seasonHistory.length > 0 && (
        <div className="mt-10">
          <h2 className="font-condensed text-2xl font-bold uppercase tracking-wide">Career</h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-text-muted">
                  <th className="px-4 py-2 font-condensed text-xs font-semibold uppercase tracking-wide">Season</th>
                  <th className="table-mono px-4 py-2 text-right font-condensed text-xs font-semibold uppercase tracking-wide">Record</th>
                  <th className="table-mono px-4 py-2 text-right font-condensed text-xs font-semibold uppercase tracking-wide">PF</th>
                  <th className="table-mono px-4 py-2 text-right font-condensed text-xs font-semibold uppercase tracking-wide">PA</th>
                  <th className="px-4 py-2 text-right font-condensed text-xs font-semibold uppercase tracking-wide">Result</th>
                </tr>
              </thead>
              <tbody>
                {seasonHistory.map((row) => (
                  <tr key={row.season} className="border-b border-border last:border-0 odd:bg-surface/40">
                    <td className="px-4 py-2 font-medium">{row.season}</td>
                    <td className="table-mono px-4 py-2 text-right">{row.record}</td>
                    <td className="table-mono px-4 py-2 text-right">{fmtPoints(row.pf)}</td>
                    <td className="table-mono px-4 py-2 text-right text-text-muted">{fmtPoints(row.pa)}</td>
                    <td
                      className={`px-4 py-2 text-right font-semibold ${
                        row.result === "Champion" ? "text-gold" : row.result === "Missed Playoffs" ? "text-text-dim" : ""
                      }`}
                    >
                      {row.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Current roster */}
      {roster.length > 0 && (
        <div className="mt-10">
          <h2 className="font-condensed text-2xl font-bold uppercase tracking-wide">Current Roster</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {roster.map((p) => (
              <p key={p.playerId} className="truncate text-sm">
                <span className="table-mono mr-2 text-xs text-text-dim">{p.position}</span>
                {p.name}
                {p.team ? <span className="text-text-dim"> · {p.team}</span> : null}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* 8. Draft tendencies */}
      {draft.avgPickByRound.length > 0 && (
        <div className="mt-10">
          <h2 className="font-condensed text-2xl font-bold uppercase tracking-wide">Draft Tendencies</h2>
          <p className="mt-2 text-sm text-text-muted">Average pick taken, by round, across every draft.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {draft.avgPickByRound.map((r) => (
              <div key={r.round} className="rounded border border-border bg-surface px-3 py-2 text-center">
                <p className="font-condensed text-xl font-bold stat-num">{r.avgPick.toFixed(1)}</p>
                <p className="font-condensed text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  Rd {r.round}
                </p>
              </div>
            ))}
          </div>
          {draft.mostDrafted && (
            <p className="mt-4 text-sm text-text-muted">
              Most-drafted player: <span className="font-semibold text-text">{draft.mostDrafted.name}</span> (
              {draft.mostDrafted.count}x)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
