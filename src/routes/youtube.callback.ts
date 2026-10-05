import { createFileRoute } from "@tanstack/react-router";
import { handleYoutubeCallback } from "@/lib/youtube.callback.server";

export const Route = createFileRoute("/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => handleYoutubeCallback(request),
    },
  },
});
