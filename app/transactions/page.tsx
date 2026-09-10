import { getDb } from "@/lib/db/client";
import { getManagers } from "@/lib/stats";
import { getTransactionsFeed } from "@/lib/transactions";
import { TransactionFilters } from "@/components/TransactionFilters";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  waiver: "Waiver",
  free_agent: "Free Agent",
  trade: "Trade",
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; type?: string; manager?: string }>;
}) {
  const params = await searchParams;
  const db = getDb();

  const seasons = (db.prepare(`SELECT DISTINCT season FROM leagues ORDER BY season DESC`).all() as { season: string }[]).map(
    (r) => r.season,
  );
  const types = (db.prepare(`SELECT DISTINCT type FROM transactions ORDER BY type`).all() as { type: string }[]).map(
    (r) => r.type,
  );
  const managers = getManagers(db).map((m) => ({ userId: m.user_id, displayName: m.display_name }));

  const feed = getTransactionsFeed(
    { season: params.season, type: params.type, userId: params.manager, limit: 100 },
    db,
  );

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">League activity</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Transactions</h1>

      <div className="mt-6">
        <TransactionFilters seasons={seasons} types={types} managers={managers} />
      </div>

      <div className="mt-8 divide-y divide-border border-t border-border">
        {feed.length === 0 && <p className="py-6 text-text-muted">No transactions match those filters.</p>}
        {feed.map((t) => (
          <div key={t.transactionId} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-text-muted">
                {TYPE_LABELS[t.type] ?? t.type} · {t.season}
                {t.week ? ` · wk ${t.week}` : ""}
              </span>
              <span className="text-xs text-text-dim">{formatDate(t.created)}</span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {t.adds.length > 0 && (
                <div>
                  {t.adds.map((a) => (
                    <p key={`add-${a.playerId}`} className="text-sm">
                      <span className="text-win">+ {a.playerName}</span>{" "}
                      <span className="text-text-muted">→ {a.managerName}</span>
                    </p>
                  ))}
                </div>
              )}
              {t.drops.length > 0 && (
                <div>
                  {t.drops.map((d) => (
                    <p key={`drop-${d.playerId}`} className="text-sm">
                      <span className="text-loss">− {d.playerName}</span>{" "}
                      <span className="text-text-muted">from {d.managerName}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>

            {t.picks.length > 0 && (
              <div className="mt-2">
                {t.picks.map((p, i) => (
                  <p key={`pick-${i}`} className="text-sm text-text-muted">
                    {p.season} Round {p.round} pick: {p.fromManagerName} → {p.toManagerName}
                  </p>
                ))}
              </div>
            )}

            {t.faabBids.length > 0 && (
              <p className="table-mono mt-2 text-xs text-gold">
                {t.faabBids.map((b) => `${b.managerName}: $${b.amount}`).join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
