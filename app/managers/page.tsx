import Link from "next/link";
import { resolveManagers, managerHref } from "@/lib/managers";
import { avatarUrl } from "@/lib/format";
import { managerColor } from "@/lib/managerColors";
import { CdnImage } from "@/components/CdnImage";

export const dynamic = "force-dynamic";

export default function ManagersIndexPage() {
  const managers = resolveManagers().sort((a, b) => a.display_name.localeCompare(b.display_name));

  return (
    <div className="py-10">
      <p className="font-condensed text-sm font-semibold uppercase tracking-widest text-accent">The League</p>
      <h1 className="font-condensed mt-2 text-4xl font-bold uppercase tracking-wide">Managers</h1>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {managers.map((m) => {
          const src = avatarUrl(m.avatar);
          const color = managerColor(m.userId);
          return (
            <Link
              key={m.userId}
              href={managerHref(m.sleeper_username)}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-text-dim"
            >
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2"
                style={{ borderColor: color }}
              >
                {src ? (
                  <CdnImage src={src} alt={m.display_name} width={56} height={56} unoptimized />
                ) : (
                  <span className="font-condensed text-xl font-bold" style={{ color }}>
                    {m.display_name.slice(0, 1)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-semibold text-text">
                  {m.display_name}
                  {m.role === "commissioner" && (
                    <span className="font-condensed shrink-0 rounded border border-gold-dim px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                      Commish
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-text-muted">{m.real_name}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
