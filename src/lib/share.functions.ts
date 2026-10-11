import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createShareToken,
  hashSharePassword,
  hashShareToken,
  verifySharePassword,
} from "./share-security.server";
import type {
  CreateProjectShareResult,
  ListProjectSharesResult,
  ResolveProjectShareResult,
  RevokeProjectShareResult,
} from "./share-types";

const unavailable = "This share link is invalid, expired, or has been revoked.";
const expirySchema = z.union([z.literal(1), z.literal(7), z.literal(30), z.null()]);

async function getAdmin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export const createProjectShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    projectId: z.string().uuid(),
    exportId: z.string().uuid(),
    password: z.string().max(128).optional(),
    expiresInDays: expirySchema.optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<CreateProjectShareResult> => {
    const db: any = context.supabase;
    const { data: project, error: projectError } = await db
      .from("projects").select("id").eq("id", data.projectId).maybeSingle();
    if (projectError || !project) return { ok: false, error: "Project not found." };

    const { data: exportRow, error: exportError } = await db
      .from("exports").select("id,status,storage_path")
      .eq("id", data.exportId).eq("project_id", data.projectId).maybeSingle();
    if (exportError || !exportRow || exportRow.status !== "ready" || !exportRow.storage_path) {
      return { ok: false, error: "Choose a completed export from this project." };
    }

    const password = data.password ?? "";
    if (password.length > 0 && password.length < 8) {
      return { ok: false, error: "Share passwords must be at least 8 characters." };
    }

    const token = createShareToken();
    const days = data.expiresInDays === undefined ? 7 : data.expiresInDays;
    const expiresAt = days === null ? null : new Date(Date.now() + days * 86400000).toISOString();
    const protectedPassword = password.length ? hashSharePassword(password) : null;
    const admin = await getAdmin();
    const { data: created, error } = await admin.from("project_share_links").insert({
      project_id: data.projectId,
      export_id: data.exportId,
      token_hash: hashShareToken(token),
      password_salt: protectedPassword?.salt ?? null,
      password_hash: protectedPassword?.hash ?? null,
      expires_at: expiresAt,
    }).select("id,expires_at").single();

    if (error || !created?.id) {
      console.error("Share-link creation failed.");
      return { ok: false, error: "Couldn't create the share link. Please try again." };
    }
    return {
      ok: true,
      id: created.id,
      token,
      expiresAt: created.expires_at,
      passwordProtected: Boolean(protectedPassword),
    };
  });

export const listProjectShareLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ListProjectSharesResult> => {
    const db: any = context.supabase;
    const { data: project, error: projectError } = await db
      .from("projects").select("id").eq("id", data.projectId).maybeSingle();
    if (projectError || !project) return { ok: false, error: "Project not found." };

    const admin = await getAdmin();
    const { data: rows, error } = await admin.from("project_share_links")
      .select("id,export_id,created_at,expires_at,revoked_at,password_hash")
      .eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(50);
    if (error) return { ok: false, error: "Couldn't load share links. Please try again." };

    return {
      ok: true,
      links: (rows ?? []).map((row: any) => ({
        id: row.id,
        exportId: row.export_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        passwordProtected: Boolean(row.password_hash),
      })),
    };
  });

export const revokeProjectShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), shareId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RevokeProjectShareResult> => {
    const db: any = context.supabase;
    const { data: project, error: projectError } = await db
      .from("projects").select("id").eq("id", data.projectId).maybeSingle();
    if (projectError || !project) return { ok: false, error: "Project not found." };

    const admin = await getAdmin();
    const { data: row, error } = await admin.from("project_share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.shareId).eq("project_id", data.projectId).is("revoked_at", null)
      .select("id").maybeSingle();
    if (error || !row) return { ok: false, error: "Share link not found or already revoked." };
    return { ok: true };
  });

export const resolveProjectShare = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(32).max(100), password: z.string().max(128).optional() }).parse(d))
  .handler(async ({ data }): Promise<ResolveProjectShareResult> => {
    if (!/^[A-Za-z0-9_-]{32,100}$/.test(data.token)) {
      return { ok: false, error: unavailable, passwordRequired: false };
    }

    const admin = await getAdmin();
    const { data: share, error: shareError } = await admin.from("project_share_links")
      .select("id,project_id,export_id,expires_at,revoked_at,password_salt,password_hash,locked_until")
      .eq("token_hash", hashShareToken(data.token)).maybeSingle();
    if (shareError || !share || share.revoked_at ||
        (share.expires_at && Date.parse(share.expires_at) <= Date.now())) {
      return { ok: false, error: unavailable, passwordRequired: false };
    }

    if (share.password_hash) {
      if (share.locked_until && Date.parse(share.locked_until) > Date.now()) {
        return { ok: false, error: "Too many password attempts. Try again in 15 minutes.", passwordRequired: true };
      }
      if (!data.password) return { ok: false, error: "", passwordRequired: true };

      if (!verifySharePassword(data.password, share.password_salt, share.password_hash)) {
        const { error } = await admin.rpc("record_project_share_password_failure", { _share_id: share.id });
        if (error) {
          console.error("Share password failure counter could not be updated.");
          return { ok: false, error: "Couldn't validate that password right now. Please retry shortly.", passwordRequired: true };
        }
        return { ok: false, error: "Incorrect password.", passwordRequired: true };
      }

      await admin.from("project_share_links")
        .update({ failed_password_attempts: 0, locked_until: null }).eq("id", share.id);
    }

    const { data: project, error: projectError } = await admin.from("projects")
      .select("title,format").eq("id", share.project_id).maybeSingle();
    if (projectError || !project) return { ok: false, error: unavailable, passwordRequired: false };

    const { data: exportRow, error: exportError } = await admin.from("exports")
      .select("filename,format,status,storage_path")
      .eq("id", share.export_id).eq("project_id", share.project_id).maybeSingle();
    if (exportError || !exportRow || exportRow.status !== "ready" || !exportRow.storage_path) {
      return { ok: false, error: "This exported video is no longer available.", passwordRequired: false };
    }

    const { data: signed, error: signedError } = await admin.storage.from("project-assets")
      .createSignedUrl(exportRow.storage_path, 900);
    if (signedError || !signed?.signedUrl) {
      return { ok: false, error: "Couldn't prepare the video for playback. Please try again.", passwordRequired: false };
    }

    return {
      ok: true,
      title: project.title,
      format: exportRow.format || project.format,
      filename: exportRow.filename,
      videoUrl: signed.signedUrl,
      expiresAt: share.expires_at,
    };
  });
