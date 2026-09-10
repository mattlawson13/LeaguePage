import { getPlayerHistory } from "@/lib/players";
import { PlayerSearch } from "@/components/PlayerSearch";

export const dynamic = "force-dynamic";

export default function PlayersPage() {
  const players = getPlayerHistory();
  const mostTraded = [...players].filter((p) => p.timesTraded > 0).sort((a, b) => b.timesTraded - a.timesTraded)[0];

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">The league</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Player history</h1>
      <p className="mt-3 max-w-xl text-text-muted">
        Every player who&apos;s ever been drafted, added, or traded in this league — {players.length} of them.
      </p>

      {mostTraded && (
        <p className="mt-6 text-sm text-text-muted">
          Most-traded player: <span className="text-text">{mostTraded.name}</span>, dealt {mostTraded.timesTraded}{" "}
          times.
        </p>
      )}

      <div className="mt-8">
        <PlayerSearch players={players} />
      </div>
    </div>
  );
}
