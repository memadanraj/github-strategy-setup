export type ProjectOwnershipLookup = (
  projectId: string,
  userId: string,
) => PromiseLike<{
  data: { id: string } | null;
  error: unknown | null;
}>;

/**
 * Fail closed when the authenticated project lookup fails or returns no owned
 * row. The caller should implement lookup with the request-scoped Supabase client
 * and explicitly constrain both project id and user id.
 */
export async function confirmProjectOwnership(options: {
  projectId: string;
  userId: string;
  lookup: ProjectOwnershipLookup;
}): Promise<boolean> {
  if (!options.projectId || !options.userId) return false;

  try {
    const result = await options.lookup(options.projectId, options.userId);
    return !result.error && result.data?.id === options.projectId;
  } catch {
    return false;
  }
}
