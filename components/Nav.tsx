"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/matchups", label: "Matchups" },
  { href: "/standings", label: "Standings" },
  { href: "/transactions", label: "Transactions" },
  { href: "/playoff-odds", label: "Playoff Odds" },
  { href: "/odds", label: "Betting Odds" },
  { href: "/superlatives", label: "Superlatives" },
  { href: "/history", label: "History" },
  { href: "/trophies", label: "Trophy Room" },
  { href: "/players", label: "Players" },
  { href: "/managers", label: "Managers" },
  { href: "/rivalries", label: "Rivalries" },
  { href: "/news", label: "News" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-base/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="font-condensed shrink-0 py-3 text-xl font-bold uppercase tracking-wide text-text">
          Lawson FF Gang
        </Link>
        <nav className="scrollbar-none flex-1 overflow-x-auto">
          <ul className="flex items-center gap-1 whitespace-nowrap">
            {LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`font-condensed block rounded px-3 py-3 text-sm font-semibold uppercase tracking-wide transition-colors ${
                      active
                        ? "text-accent"
                        : "text-text-muted hover:text-text"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
