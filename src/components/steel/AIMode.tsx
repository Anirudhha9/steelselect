import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, User, Bot, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AIApplication =
  | "construction"
  | "architecture"
  | "machine-parts"
  | "automotive"
  | "railways"
  | "shipbuilding"
  | "process-industries"
  | "chemical-petrochemical"
  | "food-beverage"
  | "renewable-energy"
  | "power-generation"
  | "oil-gas"
  | "medical-equipment"
  | "consumer-products"
  | "kitchen-appliances"
  | "other";

export type AIEnvironment =
  | "mild-indoor"
  | "outdoor"
  | "marine-coastal"
  | "industrial"
  | "chemical-corrosive"
  | "high-temperature"
  | "low-temperature"
  | "high-humidity"
  | "other";

export type AICostPreference = "budget" | "balanced" | "premium";

export interface AIState {
  application: AIApplication | null;
  environment: AIEnvironment | null;
  costPreference: AICostPreference | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const APPLICATION_OPTIONS: { value: AIApplication; label: string }[] = [
  { value: "construction", label: "Construction & Infrastructure" },
  { value: "architecture", label: "Architecture" },
  { value: "machine-parts", label: "Machine Parts" },
  { value: "automotive", label: "Automotive" },
  { value: "railways", label: "Railways" },
  { value: "shipbuilding", label: "Shipbuilding" },
  { value: "process-industries", label: "Process Industries" },
  { value: "chemical-petrochemical", label: "Chemical & Petrochemical" },
  { value: "food-beverage", label: "Food & Beverage" },
  { value: "renewable-energy", label: "Renewable Energy" },
  { value: "power-generation", label: "Power Generation" },
  { value: "oil-gas", label: "Oil & Gas" },
  { value: "medical-equipment", label: "Medical Equipment" },
  { value: "consumer-products", label: "Consumer Products" },
  { value: "kitchen-appliances", label: "Kitchen & Appliances" },
  { value: "other", label: "Other" },
];

const ENVIRONMENT_OPTIONS: { value: AIEnvironment; label: string }[] = [
  { value: "mild-indoor", label: "Mild / Indoor" },
  { value: "outdoor", label: "Outdoor" },
  { value: "marine-coastal", label: "Marine / Coastal" },
  { value: "industrial", label: "Industrial" },
  { value: "chemical-corrosive", label: "Chemical / Corrosive" },
  { value: "high-temperature", label: "High Temperature" },
  { value: "low-temperature", label: "Low Temperature" },
  { value: "high-humidity", label: "High Humidity" },
  { value: "other", label: "Other" },
];

const COST_OPTIONS: { value: AICostPreference; label: string }[] = [
  { value: "budget", label: "Budget" },
  { value: "balanced", label: "Balanced" },
  { value: "premium", label: "Premium" },
];

const STARTER_PROMPTS = [
  "Which grade is suitable for a coastal application?",
  "I need a corrosion-resistant grade for machinery.",
  "Help me choose a stainless steel grade.",
];

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground shadow-xs outline-none transition-all hover:border-primary/35 focus:border-primary focus:ring-4 focus:ring-primary/12";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export function AIMode() {
  const [aiState, setAIState] = useState<AIState>({
    application: null,
    environment: null,
    costPreference: null,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "AI recommendations will be available soon. This is a placeholder response — the AI backend integration is coming in a future update.",
      };
      setMessages((prev) => [...prev, aiMsg]);
      setThinking(false);
    }, 1500);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
      {/* Input section */}
      <div className="space-y-6">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="border-b border-border bg-gradient-hero px-5 py-6 sm:px-8">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft">
                <Sparkles className="size-5 text-primary" />
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">AI Assistant</h2>
                <p className="text-xs text-muted-foreground">
                  Describe your needs and get intelligent recommendations.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-5 px-5 py-6 sm:px-8">
            <Field label="Application">
              <select
                className={selectClass}
                value={aiState.application ?? ""}
                onChange={(e) =>
                  setAIState((s) => ({
                    ...s,
                    application: (e.target.value || null) as AIApplication | null,
                  }))
                }
              >
                <option value="">Select an application…</option>
                {APPLICATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Environment">
              <select
                className={selectClass}
                value={aiState.environment ?? ""}
                onChange={(e) =>
                  setAIState((s) => ({
                    ...s,
                    environment: (e.target.value || null) as AIEnvironment | null,
                  }))
                }
              >
                <option value="">Select environment…</option>
                {ENVIRONMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Cost Preference">
              <div className="grid grid-cols-3 gap-2">
                {COST_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() =>
                      setAIState((s) => ({
                        ...s,
                        costPreference:
                          s.costPreference === o.value ? null : o.value,
                      }))
                    }
                    className={cn(
                      "h-11 rounded-lg border text-sm font-medium transition-all",
                      aiState.costPreference === o.value
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-input bg-card text-muted-foreground hover:border-primary/35 hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </div>

        {/* Starter prompts */}
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Try asking
            </h3>
            <div className="space-y-2">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/40 px-4 py-3 text-left text-sm text-muted-foreground transition-all hover:border-primary/25 hover:bg-accent/30 hover:text-foreground"
                >
                  <span>{p}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Chat section */}
      <div className="flex h-[calc(100vh-280px)] min-h-[400px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2 border-b border-border bg-gradient-hero px-5 py-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft">
            <Bot className="size-4 text-primary" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
              AI Chat
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Conversational grade recommendations
            </p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
          {messages.length === 0 && !thinking ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft">
                <Sparkles className="size-7 text-primary" />
              </span>
              <p className="font-display text-base font-semibold text-foreground">
                Start a conversation
              </p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Describe your application or ask about stainless steel grades to get started.
              </p>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex gap-3",
                    m.role === "user" ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      m.role === "user"
                        ? "bg-secondary"
                        : "bg-primary-soft",
                    )}
                  >
                    {m.role === "user" ? (
                      <User className="size-4 text-muted-foreground" />
                    ) : (
                      <Bot className="size-4 text-primary" />
                    )}
                  </span>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      m.role === "user"
                        ? "rounded-tr-sm bg-primary text-primary-foreground"
                        : "rounded-tl-sm border border-border bg-secondary/40 text-foreground",
                    )}
                  >
                    {m.text}
                  </div>
                </div>
              ))}

              {thinking ? (
                <div className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
                    <Bot className="size-4 text-primary" />
                  </span>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border bg-secondary/40 px-4 py-3">
                    <span className="size-2 animate-bounce rounded-full bg-primary/50 [animation-delay:0ms]" />
                    <span className="size-2 animate-bounce rounded-full bg-primary/50 [animation-delay:150ms]" />
                    <span className="size-2 animate-bounce rounded-full bg-primary/50 [animation-delay:300ms]" />
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="Describe your application or ask about stainless steel grades…"
              className="h-11 flex-1 rounded-lg border border-input bg-card px-4 text-sm text-foreground shadow-xs outline-none transition-all placeholder:text-muted-foreground/70 hover:border-primary/35 focus:border-primary focus:ring-4 focus:ring-primary/12"
            />
            <Button
              variant="hero"
              size="icon"
              onClick={() => send(input)}
              disabled={!input.trim() || thinking}
              className="size-11 shrink-0"
            >
              <Send className="size-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
