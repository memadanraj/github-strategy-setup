export type ConfirmedYouTubeUpload = {
  id: string;
  url: string;
  providerResponse: unknown;
  uploadedAt: string;
};

export type YouTubePublicationUpdateResult = {
  data: { id: string } | null;
  error: unknown | null;
};

export type YouTubePublicationUpdater = (
  patch: Record<string, unknown>,
) => PromiseLike<YouTubePublicationUpdateResult>;

export type YouTubePublicationFailureSettlement =
  | { kind: "failed"; message: string }
  | { kind: "published"; videoId: string; url: string; warning: string }
  | { kind: "reconciliation"; videoId?: string; url?: string; message: string };

function safeFailureMessage(cause: unknown): string {
  const message = cause instanceof Error && cause.message.trim()
    ? cause.message
    : "YouTube publishing follow-up failed.";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 400);
}

/**
 * Keep local publication state aligned with confirmed external side effects.
 * Once YouTube returns a video ID, never rewrite the publication as failed just
 * because thumbnail or local finalization work subsequently failed.
 */
export async function settleYouTubePublicationFailure(options: {
  cause: unknown;
  uploadAttempted: boolean;
  uploadedVideo: ConfirmedYouTubeUpload | null;
  thumbnailUploaded: boolean;
  persist: YouTubePublicationUpdater;
}): Promise<YouTubePublicationFailureSettlement> {
  const reason = safeFailureMessage(options.cause);
  const now = new Date().toISOString();

  if (options.uploadedVideo) {
    const video = options.uploadedVideo;
    const patch = {
      youtube_video_id: video.id,
      youtube_url: video.url,
      status: "published",
      published_at: video.uploadedAt,
      error: `Video is published, but follow-up processing failed: ${reason}`.slice(0, 500),
      metadata: {
        thumbnailUploaded: options.thumbnailUploaded,
        response: video.providerResponse,
        followUpError: reason,
      },
      updated_at: now,
    };

    try {
      const result = await options.persist(patch);
      if (result.error || !result.data?.id) throw new Error("Publication recovery was not confirmed.");
    } catch {
      return {
        kind: "reconciliation",
        videoId: video.id,
        url: video.url,
        message: `YouTube accepted the video (${video.id}), but the app could not confirm its publication record. Do not upload it again yet; refresh the publication list or contact support.`,
      };
    }

    return {
      kind: "published",
      videoId: video.id,
      url: video.url,
      warning: `The video is published, but a follow-up step failed: ${reason}`,
    };
  }

  if (options.uploadAttempted) {
    const message = "YouTube's upload response was not confirmed. The upload may have completed; check your YouTube channel before retrying.";
    try {
      const result = await options.persist({
        status: "uploading",
        error: message,
        updated_at: now,
      });
      if (result.error || !result.data?.id) {
        return {
          kind: "reconciliation",
          message: message + " The publication record could not be updated, so manual reconciliation is required before retrying.",
        };
      }
    } catch {
      return {
        kind: "reconciliation",
        message: message + " The publication record could not be updated, so manual reconciliation is required before retrying.",
      };
    }
    return { kind: "reconciliation", message };
  }

  try {
    const result = await options.persist({
      status: "failed",
      error: reason,
      updated_at: now,
    });
    if (result.error || !result.data?.id) {
      return {
        kind: "reconciliation",
        message: reason + " The publication record could not be marked failed; check its status before retrying.",
      };
    }
  } catch {
    return {
      kind: "reconciliation",
      message: reason + " The publication record could not be marked failed; check its status before retrying.",
    };
  }

  return { kind: "failed", message: reason };
}
