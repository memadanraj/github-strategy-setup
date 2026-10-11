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
