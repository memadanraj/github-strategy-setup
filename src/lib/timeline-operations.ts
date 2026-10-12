type TimelineRpcError = { message: string } | null;
type TimelineRpcResult = { data: unknown; error: TimelineRpcError };
type TimelineRpc = (args: { _project_id: string }) => PromiseLike<TimelineRpcResult>;

function readCountResult(data: unknown, countKey: "clips_created" | "cues_created", failure: string): number {
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error(failure);
  const count = (data as Record<string, unknown>)[countKey];
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) throw new Error(failure);
  return count;
}

async function invokeTimelineRpc(
  rpc: TimelineRpc,
  projectId: string,
  countKey: "clips_created" | "cues_created",
  failure: string,
): Promise<number> {
  let result: TimelineRpcResult;
  try {
    result = await rpc({ _project_id: projectId });
  } catch {
    throw new Error(failure);
  }
  if (result.error) throw new Error(failure);
  return readCountResult(result.data, countKey, failure);
}

export async function rebuildProjectTimeline(
  rpc: TimelineRpc,
  projectId: string,
): Promise<{ clipCount: number }> {
  const clipCount = await invokeTimelineRpc(
    rpc,
    projectId,
    "clips_created",
    "Could not rebuild timeline. Existing clips were preserved.",
  );
  return { clipCount };
}

export async function regenerateProjectCaptions(
  rpc: TimelineRpc,
  projectId: string,
): Promise<{ cueCount: number }> {
  const cueCount = await invokeTimelineRpc(
    rpc,
    projectId,
    "cues_created",
    "Caption generation failed. Existing captions were preserved.",
  );
  return { cueCount };
}
