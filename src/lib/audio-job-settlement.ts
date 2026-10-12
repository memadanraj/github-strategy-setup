import {
  settleVisualJobFailure,
  type VisualFailureOutcome,
  type VisualJobFailureState,
} from "./visual-job-persistence";

export type AudioJobFailureCleanup = {
  completionMayHaveSucceeded?: boolean;
  cleanupAsset?: () => Promise<void>;
  cleanupUpload?: () => Promise<void>;
};

type AudioJobRpcArgs =
  | { _job_id: string; _output: unknown }
  | { _job_id: string; _error: string };

export type AudioJobRpc = (
  name: "complete_generation_job" | "fail_generation_job_checked",
  args: AudioJobRpcArgs,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const failureStates: VisualJobFailureState[] = [
  "failed_refunded",
  "failed_without_reservation",
  "already_failed",
  "already_complete",
  "not_found",
  "not_active",
];

export async function completeAudioJob(
  rpc: AudioJobRpc,
  jobId: string,
  output: unknown,
): Promise<void> {
  const { error } = await rpc("complete_generation_job", {
    _job_id: jobId,
    _output: output,
  });
  if (error) throw new Error("Could not finalize the audio generation job.");
}

export async function failAudioJob(
  rpc: AudioJobRpc,
  jobId: string,
  message: string,
  cleanup: AudioJobFailureCleanup = {},
): Promise<VisualFailureOutcome> {
  return settleVisualJobFailure(async (safeMessage) => {
    const { data, error } = await rpc("fail_generation_job_checked", {
      _job_id: jobId,
      _error: safeMessage.slice(0, 500),
    });
    if (error || typeof data !== "string") {
      throw new Error("Could not confirm audio job settlement.");
    }
    if (!failureStates.includes(data as VisualJobFailureState)) {
      throw new Error("Audio job settlement returned an unknown state.");
    }
    return data as VisualJobFailureState;
  }, message, cleanup);
}
