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

const TITLE = "Stainless Steel Grade Selector";
const DESCRIPTION =
  "Find the right stainless steel grade for your application — compare strength, corrosion resistance, toughness, weldability and cost.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stainless Steel Grade Selector — Material Selection Tool" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Stainless Steel Grade Selector" },
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
      <header className="sticky top-0 z-30 border-b border-border/80 bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/JSL.NS_BIG-9d94c2bf.png"
              alt="Jindal Stainless"
              className="h-9 w-auto object-contain"
            />
            <span className="leading-tight">
              <span className="block font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground">
                Grade Selector
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Stainless steel material selection
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex rounded-full border border-border bg-card p-0.5 shadow-xs">
              <button
                type="button"
                onClick={() => setMode("engineering")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all sm:px-4",
                  mode === "engineering"
                    ? "bg-gradient-primary text-primary-foreground shadow-sm"
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
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all sm:px-4",
                  mode === "ai"
                    ? "bg-gradient-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Sparkles className="size-3.5" />
                <span className="hidden sm:inline">AI</span>
              </button>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-6xl border-t border-border/60 px-5 py-2 sm:px-8">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium tracking-wide text-muted-foreground">
            <span>75+ grades</span>
            <span className="hidden h-1 w-1 rounded-full bg-primary/60 sm:inline" />
            <span className="hidden sm:inline">Multi-parameter scoring</span>
            <span className="hidden h-1 w-1 rounded-full bg-primary/60 sm:inline" />
            <span className="hidden sm:inline">Engineering-based recommendations</span>
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {mode === "ai" ? (
          <AIMode
            aiState={aiState}
            onAIStateChange={setAIState}
            messages={chatMessages}
            onMessagesChange={setChatMessages}
          />
        ) : loading ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-primary-soft">
              <Loader2 className="size-8 animate-spin text-primary" />
            </span>
            <p className="font-display text-lg font-semibold text-foreground">
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
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
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
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
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
