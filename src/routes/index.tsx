import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Sliders, Sparkles } from "lucide-react";

import { AIMode, type AIState, type ChatMessage } from "@/components/steel/AIMode";
import { InfoDialog, type InfoDialogKind } from "@/components/steel/InfoDialogs";
import { RequirementsForm } from "@/components/steel/RequirementsForm";
import { ResultsView } from "@/components/steel/ResultsView";
import { SelectionSidebar } from "@/components/steel/SelectionSidebar";
import {
  emptyRequirements,
  getRecommendations,
  type RecommendationResult,
  type UserRequirements,
} from "@/lib/recommendations";
import { cn } from "@/lib/utils";

type Mode = "engineering" | "ai";

const TITLE = "SteelSelect";
const DESCRIPTION =
  "Find the right stainless steel grade for your application — compare strength, corrosion resistance, toughness, weldability and cost.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SteelSelect — Stainless Steel Grade Selection System" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "SteelSelect" },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: Index,
});

function Index() {
  const [mode, setMode] = useState<Mode>("engineering");
  const [requirements, setRequirements] = useState<UserRequirements>(emptyRequirements);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [infoDialog, setInfoDialog] = useState<InfoDialogKind>(null);
  const [aiState, setAIState] = useState<AIState>({
    application: null,
    environment: null,
    costPreference: null,
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await getRecommendations(requirements);
      setResult(res);
    } catch {
      setResult({
        recommendations: [],
        consideredOptional: [],
        error: "Something went wrong while generating recommendations. Please try again.",
        serverError: true,
      });
    } finally {
      setLoading(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const showResults = result !== null && !loading;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-2.5 sm:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/JSL.NS_BIG-9d94c2bf.png"
              alt="Jindal Stainless"
              className="h-8 w-auto object-contain"
            />
            <div className="h-8 w-px bg-border" />
            <span className="leading-tight">
              <span className="block font-display text-sm font-bold tracking-tight text-foreground">
                SteelSelect
              </span>
              <span className="block text-[10px] text-muted-foreground">
                Stainless Steel Grade Selection System
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex rounded-md border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setMode("engineering")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors",
                  mode === "engineering"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Sliders className="size-3.5" />
                <span className="hidden sm:inline">Engineering</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("ai")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors",
                  mode === "ai"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Sparkles className="size-3.5" />
                <span className="hidden sm:inline">AI</span>
              </button>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-[1400px] border-t border-border/60 px-5 py-1.5 sm:px-8">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">
            <span>75+ grades</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline" />
            <span className="hidden sm:inline">Multi-parameter scoring</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline" />
            <span className="hidden sm:inline">Engineering-based recommendations</span>
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-8 sm:px-8 sm:py-10">
        {mode === "ai" ? (
          <AIMode
            aiState={aiState}
            onAIStateChange={setAIState}
            messages={chatMessages}
            onMessagesChange={setChatMessages}
          />
        ) : loading ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
            <span className="flex size-14 items-center justify-center rounded-md border border-border bg-card">
              <Loader2 className="size-7 animate-spin text-primary" />
            </span>
            <p className="font-display text-base font-semibold text-foreground">
              Analyzing your requirements...
            </p>
            <p className="text-sm text-muted-foreground">
              Matching your inputs against candidate grades.
            </p>
          </div>
        ) : showResults ? (
          <ResultsView
            requirements={requirements}
            result={result}
            onEdit={() => setResult(null)}
            onRetry={handleSubmit}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            <div>
              <RequirementsForm
                value={requirements}
                onChange={setRequirements}
                onSubmit={handleSubmit}
                loading={loading}
              />
            </div>
            <SelectionSidebar />
          </div>
        )}
      </main>

      <footer className="mt-6 border-t border-border bg-card">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="font-display text-sm font-bold text-foreground">{TITLE}</p>
            <p className="text-xs text-muted-foreground">
              Engineering material selection made simpler.
            </p>
          </div>
          <nav className="flex gap-5 text-xs font-medium text-muted-foreground">
            <button
              type="button"
              className="transition-colors hover:text-primary"
              onClick={() => setInfoDialog("about")}
            >
              About
            </button>
            <button
              type="button"
              className="transition-colors hover:text-primary"
              onClick={() => setInfoDialog("methodology")}
            >
              Methodology
            </button>
            <button
              type="button"
              className="transition-colors hover:text-primary"
              onClick={() => setInfoDialog("contact")}
            >
              Contact
            </button>
          </nav>
        </div>
      </footer>

      <InfoDialog kind={infoDialog} onOpenChange={(v) => !v && setInfoDialog(null)} />
    </div>
  );
}
