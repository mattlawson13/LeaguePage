"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const LINKS: { href: string; label: string }[] = [
  { href: "/matchups", label: "Matchups" },
  { href: "/articles", label: "Articles" },
  { href: "/power-rankings", label: "Power Rankings" },
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
  { href: "/wordle", label: "Wordle" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 pt-4">
          <Link href="/" className="font-condensed text-lg font-bold tracking-tight text-text">
            Lawson FF Gang
          </Link>
          <ThemeToggle />
        </div>
        <nav className="overflow-x-auto">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 whitespace-nowrap">
            {LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`block border-b-2 py-3 text-sm transition-colors ${
                      active ? "border-accent text-text" : "border-transparent text-text-muted hover:text-text"
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
