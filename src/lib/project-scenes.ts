type SceneMutationRpcError = { message: string } | null;
type SceneMutationRpcResult = { data: unknown; error: SceneMutationRpcError };
type CreateSceneArgs = { _project_id: string; _title: string };
type DeleteSceneArgs = { _project_id: string; _scene_id: string };
type CreateSceneRpc = (args: CreateSceneArgs) => PromiseLike<SceneMutationRpcResult>;
type DeleteSceneRpc = (args: DeleteSceneArgs) => PromiseLike<SceneMutationRpcResult>;

export async function createProjectScene(
  rpc: CreateSceneRpc,
  projectId: string,
  title: string,
): Promise<string> {
  const { data, error } = await rpc({ _project_id: projectId, _title: title.trim().slice(0, 120) || "New scene" });
  if (error) throw new Error(error.message || "Could not create scene.");
  if (typeof data !== "string" || !data) throw new Error("Database did not return the new scene ID.");
  return data;
}

export async function deleteProjectScene(
  rpc: DeleteSceneRpc,
  projectId: string,
  sceneId: string,
): Promise<void> {
  const { data, error } = await rpc({ _project_id: projectId, _scene_id: sceneId });
  if (error) throw new Error(error.message || "Could not delete scene.");
  if (data !== true) throw new Error("Scene not found in this project.");
}

type SceneMoveRpcError = { message: string } | null;
type SceneMoveRpcResult = { data: unknown; error: SceneMoveRpcError };
type SceneMoveArgs = { _project_id: string; _scene_id: string; _direction: -1 | 1 };

type SceneMoveRpc = (args: SceneMoveArgs) => PromiseLike<SceneMoveRpcResult>;

export function canMoveScene(index: number, direction: -1 | 1, sceneCount: number): boolean {
  if (!Number.isInteger(index) || !Number.isInteger(sceneCount) || sceneCount < 0) return false;
  if (direction !== -1 && direction !== 1) return false;
  const target = index + direction;
  return index >= 0 && index < sceneCount && target >= 0 && target < sceneCount;
}

export async function moveProjectScene(
  rpc: SceneMoveRpc,
  projectId: string,
  sceneId: string,
  direction: -1 | 1,
): Promise<void> {
  if (direction !== -1 && direction !== 1) throw new Error("Invalid scene movement direction.");
  const { data, error } = await rpc({
    _project_id: projectId,
    _scene_id: sceneId,
    _direction: direction,
  });
  if (error) throw new Error(error.message || "Could not reorder scenes.");
  if (data !== true) throw new Error("Scene not found or cannot move further in that direction.");
}
