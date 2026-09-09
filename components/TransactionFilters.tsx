"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function TransactionFilters({
  seasons,
  types,
  managers,
}: {
  seasons: string[];
  types: string[];
  managers: { userId: string; displayName: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/transactions?${params.toString()}`);
  }

  const selectClass =
    "rounded border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none";

  return (
    <div className="flex flex-wrap gap-3">
      <select
        className={selectClass}
        defaultValue={searchParams.get("season") ?? ""}
        onChange={(e) => updateParam("season", e.target.value)}
      >
        <option value="">All seasons</option>
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        defaultValue={searchParams.get("type") ?? ""}
        onChange={(e) => updateParam("type", e.target.value)}
      >
        <option value="">All types</option>
        {types.map((t) => (
          <option key={t} value={t}>
            {t.replace("_", " ")}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        defaultValue={searchParams.get("manager") ?? ""}
        onChange={(e) => updateParam("manager", e.target.value)}
      >
        <option value="">All managers</option>
        {managers.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
