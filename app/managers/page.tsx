import Link from "next/link";
import { resolveManagers, managerHref } from "@/lib/managers";
import { avatarUrl } from "@/lib/format";
import { managerColor } from "@/lib/managerColors";
import { CdnImage } from "@/components/CdnImage";

export const dynamic = "force-dynamic";

export default function ManagersIndexPage() {
  const managers = resolveManagers().sort((a, b) => a.display_name.localeCompare(b.display_name));

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">The league</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Managers</h1>

      <div className="mt-8 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {managers.map((m) => {
          const src = avatarUrl(m.avatar);
          const color = managerColor(m.userId);
          return (
            <Link key={m.userId} href={managerHref(m.sleeper_username)} className="group flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface">
                {src ? (
                  <CdnImage src={src} alt="" width={44} height={44} unoptimized />
                ) : (
                  <span className="text-lg text-text-dim">{m.display_name.slice(0, 1)}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-text group-hover:text-accent">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                  {m.display_name}
                  {m.role === "commissioner" && <span className="shrink-0 text-xs text-gold">commish</span>}
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
