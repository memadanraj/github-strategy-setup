type ResetResult = {
  data: { id: string } | null;
  error: unknown | null;
};

export async function resetSharePasswordLockout(
  shareId: string,
  reset: (shareId: string) => Promise<ResetResult>,
): Promise<boolean> {
  if (!shareId) return false;
  try {
    const result = await reset(shareId);
    return !result.error && result.data?.id === shareId;
  } catch {
    return false;
  }
}
