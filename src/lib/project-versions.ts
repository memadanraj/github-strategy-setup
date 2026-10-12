type RpcError = { message: string } | null;
type RpcResult = { data: unknown; error: RpcError };

type CreateVersionArgs = { _project_id: string; _label: string | null };
type RestoreVersionArgs = { _project_id: string; _version_id: string };

type RpcCall<Args> = (args: Args) => PromiseLike<RpcResult>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function createProjectVersion(
  rpc: RpcCall<CreateVersionArgs>,
  projectId: string,
  label: string,
): Promise<{ id: string; versionNumber: number }> {
  const { data, error } = await rpc({
    _project_id: projectId,
    _label: label.trim().slice(0, 120) || null,
  });
  if (error) throw new Error(error.message || "Couldn't save project version.");
  if (!record(data) || typeof data["id"] !== "string" ||
      typeof data["version_number"] !== "number" ||
      !Number.isInteger(data["version_number"]) || data["version_number"] < 1) {
    throw new Error("The database returned an invalid project version.");
  }
  return { id: data["id"], versionNumber: data["version_number"] };
}

export async function restoreProjectVersion(
  rpc: RpcCall<RestoreVersionArgs>,
  projectId: string,
  versionId: string,
): Promise<void> {
  const { error } = await rpc({ _project_id: projectId, _version_id: versionId });
  if (error) {
    throw new Error(error.message || "Couldn't restore project version. Your current data was preserved.");
  }
}
