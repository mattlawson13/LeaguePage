import { WordleGame } from "@/components/WordleGame";
import { getDailyAnswer } from "@/lib/wordle";

export const dynamic = "force-dynamic";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function WordlePage() {
  const date = todayKey();
  const answer = getDailyAnswer(date);

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">A little something extra</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">League Wordle</h1>
      <p className="mt-3 max-w-xl text-text-muted">
        Guess today&apos;s mystery player, pulled from a roster somewhere in this league. One new player a day, six
        guesses, letters only.
      </p>

      <div className="mt-8">
        {answer ? (
          <WordleGame date={date} wordLength={answer.word.length} />
        ) : (
          <p className="text-text-muted">No rostered players available yet. Run the ingest script first.</p>
        )}
      </div>
    </div>
  );
}
