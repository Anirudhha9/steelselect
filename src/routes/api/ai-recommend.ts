import { createFileRoute } from "@tanstack/react-router";

import { aiRecommendGrades } from "@/lib/ai-recommend.functions";

export const Route = createFileRoute("/api/ai-recommend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json(
            { success: false, message: "Invalid JSON in request body.", geminiConfigured: false },
            { status: 400 },
          );
        }
        try {
          const result = await aiRecommendGrades({ data: body });
          const status = result.success ? 200 : result.geminiConfigured ? 422 : 503;
          return Response.json(result, { status });
        } catch (err) {
          return Response.json(
            {
              success: false,
              message: "An unexpected error occurred while processing your request.",
              geminiConfigured: false,
              error: err instanceof Error ? err.message : "Unknown error",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
