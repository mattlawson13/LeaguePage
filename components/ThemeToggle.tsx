"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const THEME_EVENT = "themechange";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getSnapshot(): Theme {
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : getSystemTheme();
}

// Matches the light default the app renders before any client JS runs.
function getServerSnapshot(): Theme {
  return "light";
}

function subscribe(callback: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  mediaQuery.addEventListener("change", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
    mediaQuery.removeEventListener("change", callback);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle color theme"
      className="flex h-8 w-8 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-text"
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.25" />
          <path
            d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.95 3.05l-1.06 1.06M4.11 11.9l-1.06 1.06M12.95 12.95l-1.06-1.06M4.11 4.11 3.05 3.05"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
