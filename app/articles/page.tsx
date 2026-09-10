import { getArticles, type ArticleCategory } from "@/lib/articles";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<ArticleCategory, string> = {
  recap: "Recap",
  "power-rankings": "Power Rankings",
  "trash-talk": "Trash Talk",
  buzz: "Buzz",
};

const CATEGORY_COLOR: Record<ArticleCategory, string> = {
  recap: "text-text-muted",
  "power-rankings": "text-gold",
  "trash-talk": "text-loss",
  buzz: "text-win",
};

export default function ArticlesPage() {
  const articles = getArticles();

  return (
    <div className="py-14">
      <p className="text-sm text-text-muted">The league</p>
      <h1 className="font-condensed mt-1 text-3xl font-bold tracking-tight text-text">Articles</h1>
      <p className="mt-3 max-w-xl text-text-muted">
        Recaps, power rankings movement, trash talk, and waiver buzz, generated after every completed week.
      </p>

      <div className="mt-10 divide-y divide-border border-t border-border">
        {articles.length === 0 && (
          <p className="py-6 text-text-muted">Nothing yet. Check back once week 1 wraps.</p>
        )}
        {articles.map((a) => (
          <div key={a.id} className="py-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`font-semibold uppercase tracking-wide ${CATEGORY_COLOR[a.category]}`}>
                {CATEGORY_LABEL[a.category]}
              </span>
              {a.week && (
                <>
                  <span className="text-text-dim">·</span>
                  <span className="text-text-dim">
                    {a.season} Week {a.week}
                  </span>
                </>
              )}
            </div>
            <p className="font-condensed mt-1 text-lg font-semibold text-text">{a.title}</p>
            <div className="mt-2 flex flex-col gap-2">
              {a.paragraphs.map((p, i) => (
                <p key={i} className="text-sm text-text-muted">
                  {p}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
