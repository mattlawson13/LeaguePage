import { notFound } from "next/navigation";
import Link from "next/link";
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

export const dynamic = "force-dynamic";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gold" | "muted" }) {
  return (
    <div>
      <p
        className={`font-condensed stat-num text-2xl font-bold ${
          tone === "gold" ? "text-gold" : tone === "muted" ? "text-text-dim" : "text-text"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-text-muted">{label}</p>
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
    <div className="py-14">
      {/* 1. Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface">
          {avatarSrc ? (
            <CdnImage src={avatarSrc} alt="" width={64} height={64} unoptimized />
          ) : (
            <span className="font-condensed text-2xl font-bold text-text-dim">{manager.display_name.slice(0, 1)}</span>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
            <h1 className="font-condensed text-3xl font-bold tracking-tight text-text">{manager.display_name}</h1>
            {manager.role === "commissioner" && <span className="text-sm text-gold">commissioner</span>}
          </div>
          <p className="mt-0.5 text-text-muted">{manager.real_name}</p>
        </div>
      </div>

      {/* 2. All-time record */}
      <div className="mt-8 grid grid-cols-3 gap-y-6 border-y border-border py-6 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Record" value={fmtRecord(record.wins, record.losses, record.ties)} />
        <Stat label="Win %" value={`${(record.winPct * 100).toFixed(1)}%`} />
        <Stat label="Points for" value={fmtPoints(record.pf)} />
        <Stat label="Points against" value={fmtPoints(record.pa)} tone="muted" />
        <Stat label="Point diff" value={`${record.diff >= 0 ? "+" : ""}${fmtPoints(record.diff)}`} />
        <Stat label="Avg PPG" value={fmtPoints(record.avgPpg)} />
        <Stat label="Seasons played" value={String(record.seasonsPlayed)} />
        <Stat label="Playoff W-L" value={`${record.playoffWins}-${record.playoffLosses}`} />
        <Stat label="Championships" value={String(record.championships)} tone={record.championships > 0 ? "gold" : "muted"} />
        <Stat label="Runner-ups" value={String(record.runnerUps)} tone="muted" />
        <Stat label="Last place" value={String(record.lastPlaceFinishes)} tone="muted" />
        {record.bestSeasonFinish && <Stat label="Best finish" value={ordinal(record.bestSeasonFinish)} />}
        {record.worstSeasonFinish && <Stat label="Worst finish" value={ordinal(record.worstSeasonFinish)} tone="muted" />}
        {record.bestWeek && (
          <Stat label={`Best week (${record.bestWeek.season} wk ${record.bestWeek.week})`} value={fmtPoints(record.bestWeek.points)} />
        )}
        {record.worstWeek && (
          <Stat
            label={`Worst week (${record.worstWeek.season} wk ${record.worstWeek.week})`}
            value={fmtPoints(record.worstWeek.points)}
            tone="muted"
          />
        )}
      </div>

      {/* 3. Bio */}
      {manager.bio && <p className="mt-8 max-w-xl text-lg leading-relaxed text-text">{manager.bio}</p>}

      {/* 4. Favorites strip */}
      {hasFavorites && (
        <div className="mt-8 flex flex-wrap items-center gap-8">
          {favoritePlayer && (
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-surface">
                <CdnImage
                  src={favoritePlayer.portraitUrl}
                  alt=""
                  width={64}
                  height={64}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="text-xs text-text-muted">Favorite player</p>
                <p className="text-text">{favoritePlayer.fullName}</p>
              </div>
            </div>
          )}
          {favoriteTeamLogo && (
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden">
                <CdnImage
                  src={favoriteTeamLogo}
                  alt=""
                  width={56}
                  height={56}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <p className="text-xs text-text-muted">Favorite team</p>
                <p className="text-text">{manager.favorite_team}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Rivalries */}
      {rivalries.length > 0 && (
        <div className="mt-12">
          <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Rivalries</h2>
          <div className="mt-4 divide-y divide-border border-t border-border">
            {rivalries.map((card, i) =>
              card.kind === "self" ? (
                <div key={`self-${i}`} className="border-l-2 border-accent py-3 pl-4">
                  <p className="text-xs text-accent">His own worst enemy</p>
                  <p className="font-condensed mt-1 text-xl font-bold text-text">
                    {manager.display_name} vs. {manager.display_name}
                  </p>
                </div>
              ) : (
                <div key={card.rival.userId} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={managerHref(card.rival.sleeper_username)} className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: managerColor(card.rival.userId) }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-text hover:text-accent">{card.rival.display_name}</span>
                    </Link>
                    {card.houseDivided && <span className="shrink-0 text-xs text-gold">house divided</span>}
                  </div>
                  {card.headToHead ? (
                    <p className="table-mono mt-1 text-sm text-text-muted">
                      {fmtRecord(card.headToHead.wins, card.headToHead.losses, card.headToHead.ties)} all-time ·{" "}
                      {card.headToHead.avgMargin >= 0 ? "+" : ""}
                      {fmtPoints(card.headToHead.avgMargin)} avg margin
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-text-muted">Haven&apos;t played yet.</p>
                  )}
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {/* 6. Career table */}
      {seasonHistory.length > 0 && (
        <div className="mt-12">
          <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Career</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-text-dim/40 text-left text-text-muted">
                  <th className="py-2 pr-2 font-normal">Season</th>
                  <th className="table-mono py-2 pr-2 text-right font-normal">Record</th>
                  <th className="table-mono py-2 pr-2 text-right font-normal">PF</th>
                  <th className="table-mono py-2 pr-2 text-right font-normal">PA</th>
                  <th className="py-2 text-right font-normal">Result</th>
                </tr>
              </thead>
              <tbody>
                {seasonHistory.map((row) => (
                  <tr key={row.season} className="border-b border-border">
                    <td className="py-2.5 pr-2 text-text">{row.season}</td>
                    <td className="table-mono py-2.5 pr-2 text-right">{row.record}</td>
                    <td className="table-mono py-2.5 pr-2 text-right">{fmtPoints(row.pf)}</td>
                    <td className="table-mono py-2.5 pr-2 text-right text-text-muted">{fmtPoints(row.pa)}</td>
                    <td
                      className={`py-2.5 text-right ${
                        row.result === "Champion" ? "text-gold" : row.result === "Missed Playoffs" ? "text-text-dim" : "text-text"
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
        <div className="mt-12">
          <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Current roster</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {roster.map((p) => (
              <p key={p.playerId} className="truncate text-sm text-text">
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
        <div className="mt-12">
          <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Draft tendencies</h2>
          <p className="mt-1 text-sm text-text-muted">Average pick taken, by round, across every draft.</p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
            {draft.avgPickByRound.map((r) => (
              <div key={r.round}>
                <p className="font-condensed stat-num text-lg font-bold text-text">{r.avgPick.toFixed(1)}</p>
                <p className="text-xs text-text-dim">rd {r.round}</p>
              </div>
            ))}
          </div>
          {draft.mostDrafted && (
            <p className="mt-4 text-sm text-text-muted">
              Most-drafted player: <span className="text-text">{draft.mostDrafted.name}</span> ({draft.mostDrafted.count}x)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
