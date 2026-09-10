import Link from "next/link";
import { getAllRivalryPairs, getSelfRivalries, getTopAutoRivalries } from "@/lib/rivalries";
import { managerHref } from "@/lib/managers";
import { fmtPoints, fmtRecord } from "@/lib/format";
import type { RivalryPair } from "@/lib/rivalries";

export const dynamic = "force-dynamic";

function RivalryRow({ pair }: { pair: RivalryPair }) {
  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={managerHref(pair.a.sleeper_username)} className="text-text hover:text-accent">
            {pair.a.display_name}
          </Link>
          <span className="text-text-dim">vs.</span>
          <Link href={managerHref(pair.b.sleeper_username)} className="text-text hover:text-accent">
            {pair.b.display_name}
          </Link>
        </div>
        {pair.houseDivided && <span className="text-xs text-gold">house divided</span>}
      </div>
      {pair.headToHead ? (
        <p className="table-mono mt-1 text-sm text-text-muted">
          {fmtRecord(pair.headToHead.wins, pair.headToHead.losses, pair.headToHead.ties)} ({pair.headToHead.games}{" "}
          games) · {fmtPoints(Math.abs(pair.headToHead.avgMargin))} pt avg margin
        </p>
      ) : (
        <p className="mt-1 text-sm text-text-muted">Haven&apos;t played yet.</p>
      )}
    </div>
  );
}

export default function RivalriesPage() {
  const named = getAllRivalryPairs().filter((p) => p.named);
  const selfRivalries = getSelfRivalries();
  const topAuto = getTopAutoRivalries(5);

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">The league</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Rivalries</h1>
      <p className="mt-3 max-w-lg text-text-muted">
        Named rivalries come from each manager&apos;s own bio; everything else is ranked automatically by games
        played, how even the record is, and how close the games have been.
      </p>

      {selfRivalries.length > 0 && (
        <div className="mt-10 divide-y divide-border border-t border-border">
          {selfRivalries.map(({ manager }) => (
            <div key={manager.userId} className="border-l-2 border-accent py-3 pl-4">
              <p className="text-xs text-accent">His own worst enemy</p>
              <p className="font-condensed mt-1 text-xl font-bold text-text">
                {manager.display_name} vs. {manager.display_name}
              </p>
            </div>
          ))}
        </div>
      )}

      {named.length > 0 && (
        <div className="mt-12">
          <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Named rivalries</h2>
          <div className="mt-2 divide-y divide-border border-t border-border">
            {named.map((pair) => (
              <RivalryRow key={`${pair.a.userId}-${pair.b.userId}`} pair={pair} />
            ))}
          </div>
        </div>
      )}

      {topAuto.length > 0 && (
        <div className="mt-12">
          <h2 className="font-condensed text-xl font-bold tracking-tight text-text">Auto-detected top 5</h2>
          <div className="mt-2 divide-y divide-border border-t border-border">
            {topAuto.map((pair) => (
              <RivalryRow key={`${pair.a.userId}-${pair.b.userId}`} pair={pair} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
