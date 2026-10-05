import { createFileRoute } from "@tanstack/react-router";
import { handleYoutubeCallback } from "@/lib/youtube.functions";

export const Route = createFileRoute("/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => handleYoutubeCallback(request),
    },
  },
});
