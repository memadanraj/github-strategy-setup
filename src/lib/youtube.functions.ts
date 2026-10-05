import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable.`);
  return value;
}
function b64(bytes: ArrayBuffer | Uint8Array) {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64");
}
function bytes(value: string) { return new Uint8Array(Buffer.from(value, "base64")); }

async function key() {
  const raw = bytes(env("YOUTUBE_TOKEN_ENCRYPTION_KEY"));
  if (raw.byteLength !== 32) throw new Error("YOUTUBE_TOKEN_ENCRYPTION_KEY must be base64-encoded 32 bytes.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(value));
  return `${b64(iv)}.${b64(encrypted)}`;
}
async function decrypt(value: string) {
  const [iv, payload] = value.split(".");
  if (!iv || !payload) throw new Error("Invalid encrypted YouTube token.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(iv) }, await key(), bytes(payload));
  return new TextDecoder().decode(plain);
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function googleToken(body: URLSearchParams) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw new Error(data.error_description || data.error || "Google token exchange failed.");
  return data;
}
async function youtubeRequest(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const r = await fetch(`https://www.googleapis.com${path}`, { ...init, headers });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error?.message || `YouTube API request failed (${r.status}).`);
  return data;
}
async function accessTokenFor(userId: string) {
  const db: any = await admin();
  const row = (await db.from("youtube_connections").select("*").eq("user_id", userId).maybeSingle()).data;
  if (!row?.refresh_token_enc) throw new Error("Connect your YouTube channel first.");
  const expires = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0;
  if (row.access_token_enc && expires > Date.now() + 60_000) return { token: await decrypt(row.access_token_enc), row };

  const refresh = await decrypt(row.refresh_token_enc);
  const token = await googleToken(new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"),
    refresh_token: refresh, grant_type: "refresh_token",
  }));
  await db.from("youtube_connections").update({
    access_token_enc: await encrypt(token.access_token),
    access_token_expires_at: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  return { token: token.access_token as string, row };
}

export const startYoutubeOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ projectId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    env("GOOGLE_CLIENT_ID"); env("GOOGLE_CLIENT_SECRET"); env("YOUTUBE_OAUTH_REDIRECT_URI"); env("YOUTUBE_TOKEN_ENCRYPTION_KEY");
    const db: any = await admin();
    const state = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    await db.from("youtube_oauth_states").insert({
      state, user_id: context.userId,
      return_path: `/projects/${data.projectId}?youtube=connected`,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    const params = new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: env("YOUTUBE_OAUTH_REDIRECT_URI"),
      response_type: "code", access_type: "offline", prompt: "consent",
      include_granted_scopes: "true", scope: OAUTH_SCOPES.join(" "), state,
    });
    return { ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  });

export const getYoutubeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db: any = await admin();
    const row = (await db.from("youtube_connections").select("channel_id,channel_title,channel_thumbnail_url,scopes,updated_at").eq("user_id", context.userId).maybeSingle()).data;
    return { connected: !!row, connection: row || null };
  });

export const disconnectYoutube = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db: any = await admin();
    await db.from("youtube_connections").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export const publishYoutubeVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    projectId: z.string().uuid(), exportId: z.string().uuid(),
    title: z.string().min(1).max(100), description: z.string().max(5000).optional().default(""),
    tags: z.array(z.string().min(1).max(100)).max(30).default([]),
    categoryId: z.string().regex(/^\d+$/).default("22"),
    privacyStatus: z.enum(["private","unlisted","public"]).default("private"),
    thumbnailAssetId: z.string().uuid().optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const db: any = await admin();
    const { token } = await accessTokenFor(context.userId);
    const exportRow = (await db.from("exports").select("id,project_id,storage_path,filename,status").eq("id", data.exportId).eq("project_id", data.projectId).maybeSingle()).data;
    if (!exportRow?.storage_path || exportRow.status !== "ready") throw new Error("Select a completed video export first.");

    const publication = (await db.from("youtube_publications").insert({
      user_id: context.userId, project_id: data.projectId, export_id: data.exportId,
      title: data.title, description: data.description, tags: data.tags,
      category_id: data.categoryId, privacy_status: data.privacyStatus,
      status: "uploading", thumbnail_asset_id: data.thumbnailAssetId || null,
    }).select("id").single()).data;
    if (!publication?.id) throw new Error("Couldn't create YouTube publication record.");

    try {
      const signed = await db.storage.from("project-assets").createSignedUrl(exportRow.storage_path, 900);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Couldn't access the rendered export.");
      const videoResponse = await fetch(signed.data.signedUrl);
      if (!videoResponse.ok) throw new Error("Couldn't download the rendered export for YouTube upload.");
      const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());

      const metadata = {
        snippet: { title: data.title, description: data.description, tags: data.tags.length ? data.tags : undefined, categoryId: data.categoryId },
        status: { privacyStatus: data.privacyStatus, selfDeclaredMadeForKids: false },
      };
      const initResponse = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(videoBytes.byteLength), "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify(metadata),
      });
      if (!initResponse.ok) {
        const error: any = await initResponse.json().catch(() => ({}));
        throw new Error(error?.error?.message || `YouTube upload initialization failed (${initResponse.status}).`);
      }
      const uploadUrl = initResponse.headers.get("location");
      if (!uploadUrl) throw new Error("YouTube did not return an upload URL.");
      const uploaded = await fetch(uploadUrl, {
        method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(videoBytes.byteLength) }, body: videoBytes,
      });
      const uploadedJson: any = await uploaded.json().catch(() => ({}));
      if (!uploaded.ok || !uploadedJson.id) throw new Error(uploadedJson?.error?.message || `YouTube upload failed (${uploaded.status}).`);

      let thumbnailUploaded = false;
      if (data.thumbnailAssetId) {
        const asset = (await db.from("assets").select("storage_path,kind").eq("id", data.thumbnailAssetId).eq("project_id", data.projectId).maybeSingle()).data;
        if (!asset?.storage_path || asset.kind !== "image") throw new Error("Selected thumbnail is not a project image.");
        const thumb = await db.storage.from("project-assets").createSignedUrl(asset.storage_path, 600);
        if (thumb.error || !thumb.data?.signedUrl) throw new Error("Couldn't access the thumbnail.");
        const image = await fetch(thumb.data.signedUrl);
        if (!image.ok) throw new Error("Couldn't download the thumbnail.");
        const imageBytes = new Uint8Array(await image.arrayBuffer());
        if (imageBytes.byteLength > 50 * 1024 * 1024) throw new Error("YouTube thumbnails must be 50 MB or smaller.");
        const mime = image.headers.get("content-type") || "image/jpeg";
        const thumbResponse = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(uploadedJson.id)}`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": mime }, body: imageBytes,
        });
        if (!thumbResponse.ok) {
          const error: any = await thumbResponse.json().catch(() => ({}));
          throw new Error(error?.error?.message || "YouTube thumbnail upload failed.");
        }
        thumbnailUploaded = true;
      }

      const youtubeUrl = `https://www.youtube.com/watch?v=${uploadedJson.id}`;
      await db.from("youtube_publications").update({
        youtube_video_id: uploadedJson.id, youtube_url: youtubeUrl, status: "published",
        published_at: new Date().toISOString(), metadata: { thumbnailUploaded, response: uploadedJson },
        updated_at: new Date().toISOString(),
      }).eq("id", publication.id);
      return { ok: true, publicationId: publication.id, videoId: uploadedJson.id, url: youtubeUrl };
    } catch (error: any) {
      await db.from("youtube_publications").update({ status: "failed", error: error?.message || "Upload failed", updated_at: new Date().toISOString() }).eq("id", publication.id);
      throw error;
    }
  });

export const getYoutubePublications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ projectId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db: any = await admin();
    const rows = (await db.from("youtube_publications").select("*").eq("project_id", data.projectId).eq("user_id", context.userId).order("created_at", { ascending: false }).limit(20)).data || [];
    return { rows };
  });

export const syncYoutubeAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ videoId: z.string().min(1), startDate: z.string(), endDate: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const db: any = await admin();
    const { token, row } = await accessTokenFor(context.userId);
    const params = new URLSearchParams({
      ids: `channel==${row.channel_id}`, startDate: data.startDate, endDate: data.endDate,
      dimensions: "day", filters: `video==${data.videoId}`,
      metrics: "views,likes,comments,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost", sort: "day",
    });
    const report = await youtubeRequest(`/youtubeanalytics/v2/reports?${params.toString()}`, token);
    const rows = report.rows || [];
    for (const r of rows) {
      await db.from("youtube_analytics_daily").upsert({
        user_id: context.userId, youtube_video_id: data.videoId, channel_id: row.channel_id, day: r[0],
        views: Number(r[1] || 0), likes: Number(r[2] || 0), comments: Number(r[3] || 0),
        estimated_minutes_watched: Number(r[4] || 0), average_view_duration_seconds: Number(r[5] || 0),
        subscribers_gained: Number(r[6] || 0), subscribers_lost: Number(r[7] || 0), updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,youtube_video_id,day" });
    }
    return { ok: true, count: rows.length };
  });

