export type ShareLinkSummary = {
  id: string;
  exportId: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  passwordProtected: boolean;
};

export type CreateProjectShareResult =
  | { ok: true; id: string; token: string; expiresAt: string | null; passwordProtected: boolean }
  | { ok: false; error: string };

export type ListProjectSharesResult =
  | { ok: true; links: ShareLinkSummary[] }
  | { ok: false; error: string };

export type ResolveProjectShareResult =
  | { ok: true; title: string; format: string; filename: string; videoUrl: string; expiresAt: string | null }
  | { ok: false; error: string; passwordRequired: boolean };

export type RevokeProjectShareResult = { ok: true } | { ok: false; error: string };
