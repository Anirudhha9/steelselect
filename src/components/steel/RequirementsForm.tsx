import { useState } from "react";
import { ArrowRight, AlertCircle, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  APPLICATION_OPTIONS,
  CORROSION_OPTIONS,
  type Application,
  type CorrosionResistance,
  type UserRequirements,
} from "@/lib/recommendations";

interface Props {
  value: UserRequirements;
  onChange: (next: UserRequirements) => void;
  onSubmit: () => void;
  loading: boolean;
}

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-foreground/20 focus:border-primary focus:ring-1 focus:ring-primary/30";

const INPUT_LIMITS = {
  uts: { min: 100, max: 2000 },
  hardness: { min: 100, max: 600 },
  tempMin: { min: -100, max: 1000 },
  tempMax: { min: -100, max: 1000 },
} as const;

function clampNumber(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function Section({
  index,
  title,
  hint,
  children,
}: {
  index: string;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border px-5 py-6 first:border-t-0 sm:px-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary font-mono text-xs font-semibold text-muted-foreground">
          {index}
        </span>
        <div className="pt-0.5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  unit,
  required,
  error,
  children,
}: {
  label: string;
  unit?: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-foreground">
        {label}
        {unit ? <span className="text-[11px] font-normal text-muted-foreground">({unit})</span> : null}
        {required ? (
          <span className="bg-primary-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
            Required
          </span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3" />
          {error}
        </span>
      ) : null}
    </label>
  );
}

const ADDITIONAL = [
  {
    key: "considerWeldability",
    label: "Weldability",
    desc: "Ease and reliability of welding",
  },
  {
    key: "considerFormability",
    label: "Formability",
    desc: "Suitability for forming and fabrication",
  },
  { key: "considerCost", label: "Cost", desc: "Material cost / value" },
] as const;

export function RequirementsForm({ value, onChange, onSubmit, loading }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  const set = <K extends keyof UserRequirements>(key: K, v: UserRequirements[K]) =>
    onChange({ ...value, [key]: v });

  const num = (raw: string) => (raw.trim() === "" ? null : Number(raw));

  const setClamped = (
    key: keyof UserRequirements,
    raw: string,
    min: number,
    max: number,
    errorKey: string,
  ) => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      set(key, null);
      setFieldErrors((prev) => ({ ...prev, [errorKey]: null }));
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      setFieldErrors((prev) => ({ ...prev, [errorKey]: "Enter a valid number" }));
      return;
    }
    if (parsed < min || parsed > max) {
      setFieldErrors((prev) => ({
        ...prev,
        [errorKey]: `Value must be between ${min} and ${max}`,
      }));
      set(key, parsed);
      return;
    }
    setFieldErrors((prev) => ({ ...prev, [errorKey]: null }));
    set(key, parsed);
  };

  const handleSubmit = () => {
    if (!value.application) {
      setError("Please select an application to continue.");
      return;
    }
    setError(null);
    onSubmit();
  };

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card shadow-[var(--shadow-card)]">
      <Section index="01" title="Application" hint="Where will this material be used?">
        <div className="max-w-md">
          <Field label="Application" required>
            <select
              className={fieldClass}
              value={value.application ?? ""}
              onChange={(e) => {
                set("application", (e.target.value || null) as Application | null);
                setError(null);
              }}
            >
              <option value="">Select an application…</option>
              {APPLICATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section
        index="02"
        title="Service Conditions & Requirements"
        hint="Fill in what you know."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum UTS" unit="MPa" error={fieldErrors.uts}>
            <input
              type="number"
              inputMode="decimal"
              placeholder="550"
              min={INPUT_LIMITS.uts.min}
              max={INPUT_LIMITS.uts.max}
              className={fieldClass}
              value={value.minimumUTS ?? ""}
              onChange={(e) =>
                setClamped(
                  "minimumUTS",
                  e.target.value,
                  INPUT_LIMITS.uts.min,
                  INPUT_LIMITS.uts.max,
                  "uts",
                )
              }
            />
          </Field>

          <Field label="Corrosion Resistance">
            <select
              className={fieldClass}
              value={value.corrosionResistance ?? ""}
              onChange={(e) =>
                set("corrosionResistance", (e.target.value || null) as CorrosionResistance | null)
              }
            >
              <option value="">No preference</option>
              {CORROSION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Brinell Hardness" error={fieldErrors.hardness}>
            <input
              type="number"
              inputMode="decimal"
              placeholder="200"
              min={INPUT_LIMITS.hardness.min}
              max={INPUT_LIMITS.hardness.max}
              className={fieldClass}
              value={value.impactToughness ?? ""}
              onChange={(e) =>
                setClamped(
                  "impactToughness",
                  e.target.value,
                  INPUT_LIMITS.hardness.min,
                  INPUT_LIMITS.hardness.max,
                  "hardness",
                )
              }
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Min. Temp." unit="°C" error={fieldErrors.tempMin}>
              <input
                type="number"
                placeholder="-40"
                min={INPUT_LIMITS.tempMin.min}
                max={INPUT_LIMITS.tempMin.max}
                className={fieldClass}
                value={value.operatingTemperatureMin ?? ""}
                onChange={(e) =>
                  setClamped(
                    "operatingTemperatureMin",
                    e.target.value,
                    INPUT_LIMITS.tempMin.min,
                    INPUT_LIMITS.tempMin.max,
                    "tempMin",
                  )
                }
              />
            </Field>
            <Field label="Max. Temp." unit="°C" error={fieldErrors.tempMax}>
              <input
                type="number"
                placeholder="400"
                min={INPUT_LIMITS.tempMax.min}
                max={INPUT_LIMITS.tempMax.max}
                className={fieldClass}
                value={value.operatingTemperatureMax ?? ""}
                onChange={(e) =>
                  setClamped(
                    "operatingTemperatureMax",
                    e.target.value,
                    INPUT_LIMITS.tempMax.min,
                    INPUT_LIMITS.tempMax.max,
                    "tempMax",
                  )
                }
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section
        index="03"
        title="Additional Parameters"
        hint="Which additional factors should we consider?"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {ADDITIONAL.map((item) => {
            const active = value[item.key];
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => set(item.key, !active)}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3.5 text-left transition-colors",
                  active
                    ? "border-primary/50 bg-primary-soft"
                    : "border-border bg-card hover:border-foreground/20 hover:bg-secondary",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border transition-colors",
                    active ? "border-primary bg-primary" : "border-input bg-background",
                  )}
                >
                  {active ? <Check className="size-3.5 text-primary-foreground" /> : null}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="border-t border-border bg-secondary/50 px-5 py-5 sm:px-6">
        {error ? (
          <div
            role="alert"
            className="mb-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="size-4" />
            {error}
          </div>
        ) : null}
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-xs text-muted-foreground">
            {'\n'}
          </p>
          <Button
            variant="hero"
            size="xl"
            disabled={loading}
            onClick={handleSubmit}
            className="w-full sm:w-auto"
          >
            {loading ? "Analyzing…" : "Find Recommended Grades"}
            <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
