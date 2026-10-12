export type VisualJobFailureState =
  | "failed_refunded"
  | "failed_without_reservation"
  | "already_failed"
  | "already_complete"
  | "not_found"
  | "not_active";

export type PreparedVisual = { path: string };

type VisualPersistenceOperations<T extends PreparedVisual> = {
  prepare: () => Promise<T>;
  upload: (output: T) => Promise<void>;
  registerAsset: (output: T) => Promise<string>;
  attachScene: (output: T, assetId: string) => Promise<void>;
  completeJob: (output: T, assetId: string) => Promise<void>;
  cleanupAsset: (output: T) => Promise<void>;
  cleanupUpload: (output: T) => Promise<void>;
  failJob: (message: string) => Promise<VisualJobFailureState>;
};

export type VisualPersistenceResult<T extends PreparedVisual> =
  | { ok: true; output: T; assetId: string }
  | { ok: false; error: string };

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "AI media generation failed.";
}

export async function persistGeneratedVisual<T extends PreparedVisual>(
  operations: VisualPersistenceOperations<T>,
): Promise<VisualPersistenceResult<T>> {
  let output: T | undefined;
  let uploadAttempted = false;
  let assetRegistrationAttempted = false;
  let assetId: string | undefined;
  let sceneAttached = false;
  let completionStarted = false;

  try {
    output = await operations.prepare();
    uploadAttempted = true;
    await operations.upload(output);

    // Mark this before the request; a timeout may occur after the DB committed.
    assetRegistrationAttempted = true;
    assetId = await operations.registerAsset(output);
    if (!assetId) throw new Error("Asset registration returned no asset ID.");

    await operations.attachScene(output, assetId);
    sceneAttached = true;
    completionStarted = true;
    await operations.completeJob(output, assetId);

    return { ok: true, output, assetId };
  } catch (cause) {
    const message = errorMessage(cause);
    let failureState: VisualJobFailureState;

    try {
      failureState = await operations.failJob(message);
    } catch {
      // A network failure during settlement leaves the final job state unknown.
      // Preserve media: deleting it could break a completion that actually committed.
      return {
        ok: false,
        error: message + " Job settlement could not be confirmed; automatic media cleanup was deferred and credit state needs reconciliation.",
      };
    }

    if (
      failureState === "already_complete" &&
      completionStarted &&
      sceneAttached &&
      assetId &&
      output
    ) {
      // The completion RPC may have committed even if its response was lost.
      return { ok: true, output, assetId };
    }

    const cleanupIsSafe = (
      failureState === "failed_refunded" ||
      failureState === "failed_without_reservation" ||
      failureState === "already_failed" ||
      failureState === "not_found"
    );
    const cleanupFailures: string[] = [];

    if (cleanupIsSafe && output) {
      if (assetRegistrationAttempted) {
        try {
          await operations.cleanupAsset(output);
        } catch {
          cleanupFailures.push("asset record");
        }
      }
      if (uploadAttempted) {
        try {
          await operations.cleanupUpload(output);
        } catch {
          cleanupFailures.push("uploaded file");
        }
      }
    }

    let settlementMessage: string;
    if (failureState === "failed_refunded" || failureState === "already_failed") {
      settlementMessage = "Your credits were refunded.";
    } else if (failureState === "failed_without_reservation") {
      settlementMessage = "The job was marked failed, but no reserved credits were available to refund.";
    } else if (failureState === "already_complete") {
      settlementMessage = "The job is already complete, so credit/refund status was not changed.";
    } else if (failureState === "not_found") {
      settlementMessage = "The job record was not found, so a credit refund could not be confirmed.";
    } else {
      settlementMessage = "The job state is not active; credit/refund status could not be confirmed.";
    }

    const cleanupMessage = cleanupFailures.length
      ? " Cleanup failed for " + cleanupFailures.join(" and ") + "; manual cleanup is required."
      : "";
    return { ok: false, error: message + " " + settlementMessage + cleanupMessage };
  }
}
