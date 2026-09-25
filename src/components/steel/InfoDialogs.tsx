import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type InfoDialogKind = "about" | "methodology" | "contact" | null;

export function InfoDialog({ kind, onOpenChange }: { kind: InfoDialogKind; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {kind === "about" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">About</DialogTitle>
              <DialogDescription>About this tool</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                The Stainless Steel Grade Selector helps engineers, designers, and procurement
                teams find the right stainless steel grade for a given application. It covers
                75+ grades across austenitic, ferritic, and martensitic families.
              </p>
              <p>
                Enter your performance requirements — strength, corrosion resistance, hardness,
                service temperature, and more — and the tool scores each grade against your
                criteria to recommend the best matches with transparent, side-by-side comparisons.
              </p>
            </div>
          </>
        )}

        {kind === "methodology" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Methodology</DialogTitle>
              <DialogDescription>How recommendations are calculated</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                Recommendations are produced by a multi-parameter scoring engine that runs over
                the full stainless-steel grade database.
              </p>
              <p>
                <span className="font-semibold text-foreground">1. Application pre-filter.</span>{" "}
                Only grades whose database application column matches the selected use case
                (e.g. Shipbuilding, Construction) enter the candidate pool.
              </p>
              <p>
                <span className="font-semibold text-foreground">2. Hard filters.</span> Grades
                that fail a minimum requirement — UTS, corrosion resistance (PREN bucket),
                Brinell hardness tolerance, or service temperature range — are eliminated.
              </p>
              <p>
                <span className="font-semibold text-foreground">3. Weighted scoring.</span> Each
                active parameter is normalized to a 0–100 score across the surviving grades.
                Parameters are weighted by application-specific profiles (e.g. corrosion is
                weighted higher for Shipbuilding, formability for Consumer Products). Weights are
                renormalized over the set of active parameters so they always sum to 100%.
              </p>
              <p>
                <span className="font-semibold text-foreground">4. Brinell hardness scoring.</span>{" "}
                Hardness is scored by closeness to the target BHN: a grade whose BHN exactly
                matches the target receives 100, and the score decreases linearly as the absolute
                difference grows.
              </p>
              <p>
                <span className="font-semibold text-foreground">5. Ranking.</span> The final score
                is the weighted sum of all parameter scores. The top grade is recommended, with
                up to two alternatives shown alongside. Confidence is reported as Baseline,
                Standard, or High based on how many parameters were used and the score separation
                between the top two grades.
              </p>
            </div>
          </>
        )}

        {kind === "contact" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Contact</DialogTitle>
              <DialogDescription>Get in touch</DialogDescription>
            </DialogHeader>
            <div className="pt-2">
              <dl className="divide-y divide-border rounded-lg border border-border">
                <div className="flex justify-between gap-4 px-3 py-2.5 text-sm">
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="text-right font-medium text-foreground">Aditya Mishra</dd>
                </div>
                <div className="flex justify-between gap-4 px-3 py-2.5 text-sm">
                  <dt className="text-muted-foreground">Education</dt>
                  <dd className="text-right font-medium text-foreground">BTech – NIT Raipur</dd>
                </div>
                <div className="flex justify-between gap-4 px-3 py-2.5 text-sm">
                  <dt className="text-muted-foreground">Batch</dt>
                  <dd className="text-right font-medium text-foreground">2028</dd>
                </div>
                <div className="flex justify-between gap-4 px-3 py-2.5 text-sm">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="text-right font-medium">
                    <a
                      href="mailto:amishra003.btech2024@mme.nitrr.ac.in"
                      className="text-primary transition-colors hover:text-primary/80"
                    >
                      amishra003.btech2024@mme.nitrr.ac.in
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
