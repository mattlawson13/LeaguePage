import Image from "next/image";
import { getManagerCareerStats } from "@/lib/stats";
import { avatarUrl, fmtPoints, fmtRecord } from "@/lib/format";
import { managerColor } from "@/lib/managerColors";

export const dynamic = "force-dynamic";

export default function ManagersPage() {
  const managers = getManagerCareerStats().sort((a, b) => b.wins / Math.max(1, b.wins + b.losses + b.ties) - a.wins / Math.max(1, a.wins + a.losses + a.ties));

  return (
    <div className="py-10">
      <p className="font-condensed text-sm font-semibold uppercase tracking-widest text-accent">Phase 3 preview</p>
      <h1 className="font-condensed mt-2 text-4xl font-bold uppercase tracking-wide">Managers</h1>
      <p className="mt-2 max-w-2xl text-text-muted">
        Full bio pages with editorial write-ups are coming. For now, here&apos;s every manager&apos;s all-time career
        record straight from the ingested data.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {managers.map((m) => {
          const src = avatarUrl(m.avatar);
          const color = managerColor(m.userId);
          return (
            <div
              key={m.userId}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2"
                style={{ borderColor: color }}
              >
                {src ? (
                  <Image src={src} alt={m.displayName} width={48} height={48} unoptimized />
                ) : (
                  <span className="font-condensed text-lg font-bold" style={{ color }}>
                    {m.displayName.slice(0, 1)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-text">{m.displayName}</p>
                <p className="table-mono text-sm text-text-muted">
                  {fmtRecord(m.wins, m.losses, m.ties)} · {fmtPoints(m.pf)} PF
                  {m.titles > 0 ? ` · 🏆 ${m.titles}` : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
