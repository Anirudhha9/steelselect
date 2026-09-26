import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CORE_SCORE_KEYS,
  SCORE_LABELS,
  type GradeRecommendation,
  type OptionalScoreKey,
} from "@/lib/recommendations";
import { ScoreBar, ScoreDial } from "./ScoreBar";

export function GradeCard({
  rec,
  best,
  consideredOptional,
  onViewDetails,
}: {
  rec: GradeRecommendation;
  best: boolean;
  consideredOptional: OptionalScoreKey[];
  onViewDetails: () => void;
}) {
  return (
    <article
      className={cn(
        "relative flex flex-col rounded-md border bg-card p-5 transition-colors",
        best
          ? "border-primary/50 shadow-[var(--shadow-elevated)]"
          : "border-border shadow-[var(--shadow-card)] hover:border-foreground/20",
      )}
    >
      {best ? (
        <span className="absolute -top-px left-0 right-0 h-0.5 bg-primary" />
      ) : null}

      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-bold text-foreground">{rec.grade}</h3>
            {best ? (
              <span className="bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                Best Match
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{rec.family}</p>
          <p className="mt-2 text-xs font-medium text-muted-foreground">
            Overall Score{" "}
            <span className="font-mono text-sm font-bold text-primary">
              {rec.overallScore} / 100
            </span>
          </p>
        </div>
        <ScoreDial score={rec.overallScore} />
      </div>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        {CORE_SCORE_KEYS.map((k) => (
          <ScoreBar key={k} label={SCORE_LABELS[k]} score={rec.scores[k]} />
        ))}
        {consideredOptional.map((k) => (
          <ScoreBar key={k} label={SCORE_LABELS[k]} score={rec.scores[k]} />
        ))}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
          Why this grade?
        </h4>
        <p className="text-sm leading-relaxed text-foreground">{rec.whyRecommended}</p>
      </div>

      <div className="mt-4">
        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Key Trade-offs
        </h4>
        <ul className="space-y-1.5">
          {rec.tradeoffs.map((t) => (
            <li key={t.text} className="flex gap-2 text-sm">
              <span className={t.type === "positive" ? "text-success" : "text-warning"}>
                {t.type === "positive" ? "+" : "!"}
              </span>
              <span className="text-muted-foreground">{t.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <Button variant="subtle" className="mt-4 w-full" onClick={onViewDetails}>
        View Grade Details
      </Button>
    </article>
  );
}
