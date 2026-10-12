export type RenderFinalizationClaimState =
  | "claimed"
  | "busy"
  | "already_complete"
  | "not_found"
  | "not_active";

type RenderFinalizationRpcResult = {
  data: unknown;
  error: { message: string } | null;
};

type RenderFinalizationRpc = (args: { _job_id: string }) => PromiseLike<RenderFinalizationRpcResult>;

const allowedStates: RenderFinalizationClaimState[] = [
  "claimed",
  "busy",
  "already_complete",
  "not_found",
  "not_active",
];

export async function claimRenderJobFinalization(
  rpc: RenderFinalizationRpc,
  jobId: string,
): Promise<RenderFinalizationClaimState> {
  const { data, error } = await rpc({ _job_id: jobId });
  if (error) throw new Error("Could not claim render finalization.");
  if (typeof data !== "string" || !allowedStates.includes(data as RenderFinalizationClaimState)) {
    throw new Error("Render finalization claim returned an unknown state.");
  }
  return data as RenderFinalizationClaimState;
}
