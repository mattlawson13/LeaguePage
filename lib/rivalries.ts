import type { Database } from "better-sqlite3";
import { getDb } from "./db/client";
import { getHeadToHeadForPair, type HeadToHeadForUser } from "./stats";
import { resolveManagers, type ResolvedManager } from "./managers";

export interface RivalryPair {
  a: ResolvedManager;
  b: ResolvedManager;
  headToHead: HeadToHeadForUser | null;
  named: boolean;
  houseDivided: boolean;
  score: number;
}

function normalizeUsername(name: string): string {
  return name.trim().toLowerCase();
}

export function isNamedPair(a: ResolvedManager, b: ResolvedManager): boolean {
  return (
    a.rivals.some((r) => normalizeUsername(r) === normalizeUsername(b.sleeper_username)) ||
    b.rivals.some((r) => normalizeUsername(r) === normalizeUsername(a.sleeper_username))
  );
}

export function isHouseDivided(a: ResolvedManager, b: ResolvedManager): boolean {
  return Boolean(
    (a.relationship && normalizeUsername(a.relationship.with) === normalizeUsername(b.sleeper_username)) ||
      (b.relationship && normalizeUsername(b.relationship.with) === normalizeUsername(a.sleeper_username)),
  );
}

/** games x how even the record is x inverse average margin, per the spec's rivalry-score formula. */
function rivalryScore(h2h: HeadToHeadForUser): number {
  const winPct = (h2h.wins + h2h.ties * 0.5) / h2h.games;
  const closeness = 1 - Math.abs(winPct - 0.5) * 2;
  const marginFactor = 1 / (1 + Math.abs(h2h.avgMargin));
  return h2h.games * closeness * marginFactor;
}

/** Every manager pair with the H2H record and rivalry score, resolved managers only (self-rivalry excluded — it's not a pair). */
export function getAllRivalryPairs(db: Database = getDb()): RivalryPair[] {
  const managers = resolveManagers(db);
  const pairs: RivalryPair[] = [];

  for (let i = 0; i < managers.length; i++) {
    for (let j = i + 1; j < managers.length; j++) {
      const a = managers[i];
      const b = managers[j];
      const headToHead = getHeadToHeadForPair(a.userId, b.userId, db);
      pairs.push({
        a,
        b,
        headToHead,
        named: isNamedPair(a, b),
        houseDivided: isHouseDivided(a, b),
        score: headToHead ? rivalryScore(headToHead) : 0,
      });
    }
  }
  return pairs;
}

export interface SelfRivalry {
  manager: ResolvedManager;
}

export function getSelfRivalries(db: Database = getDb()): SelfRivalry[] {
  return resolveManagers(db)
    .filter((m) => m.rivals.some((r) => normalizeUsername(r) === normalizeUsername(m.sleeper_username)))
    .map((manager) => ({ manager }));
}

export function getNamedRivalries(db: Database = getDb()): RivalryPair[] {
  return getAllRivalryPairs(db).filter((p) => p.named);
}

/** Everything not hand-named, ranked by rivalry score, minimum sample size so a 1-game "rivalry" can't top the list. */
export function getTopAutoRivalries(limit = 5, db: Database = getDb()): RivalryPair[] {
  return getAllRivalryPairs(db)
    .filter((p) => !p.named && p.headToHead && p.headToHead.games >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
