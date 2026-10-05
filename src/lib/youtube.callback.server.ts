import '@tanstack/react-start/server-only';

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
async function youtubeRequest(path: string, token: string) {
  const r = await fetch(`https://www.googleapis.com${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error?.message || `YouTube API request failed (${r.status}).`);
  return data;
}

export async function handleYoutubeCallback(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const db: any = await admin();

  if (error) return new Response(null, { status: 302, headers: { Location: `/dashboard?youtube=error&reason=${encodeURIComponent(error)}` } });
  if (!code || !state) return new Response(null, { status: 302, headers: { Location: "/dashboard?youtube=error&reason=missing_callback" } });

  const stateRow = (await db.from("youtube_oauth_states").select("*").eq("state", state).maybeSingle()).data;
  if (!stateRow || Date.parse(stateRow.expires_at) < Date.now()) {
    return new Response(null, { status: 302, headers: { Location: "/dashboard?youtube=error&reason=invalid_state" } });
  }

  try {
    const token = await googleToken(new URLSearchParams({
      code,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: env("YOUTUBE_OAUTH_REDIRECT_URI"),
      grant_type: "authorization_code",
    }));
    const channelResponse = await youtubeRequest("/youtube/v3/channels?part=snippet,statistics&mine=true", token.access_token);
    const channel = channelResponse.items?.[0];
    if (!channel?.id) throw new Error("No YouTube channel was found for this Google account.");

    const existing = (await db.from("youtube_connections").select("refresh_token_enc").eq("user_id", stateRow.user_id).maybeSingle()).data;
    const refreshEnc = token.refresh_token ? await encrypt(token.refresh_token) : existing?.refresh_token_enc;
    if (!refreshEnc) throw new Error("Google did not return a refresh token. Reconnect with offline access enabled.");

    await db.from("youtube_connections").upsert({
      user_id: stateRow.user_id,
      channel_id: channel.id,
      channel_title: channel.snippet?.title || null,
      channel_thumbnail_url: channel.snippet?.thumbnails?.default?.url || null,
      access_token_enc: await encrypt(token.access_token),
      refresh_token_enc: refreshEnc,
      access_token_expires_at: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(),
      scopes: String(token.scope || OAUTH_SCOPES.join(" ")).split(" "),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    await db.from("youtube_oauth_states").delete().eq("id", stateRow.id);
    return new Response(null, { status: 302, headers: { Location: stateRow.return_path } });
  } catch (error: any) {
    await db.from("youtube_oauth_states").delete().eq("id", stateRow.id);
    return new Response(null, { status: 302, headers: { Location: `/dashboard?youtube=error&reason=${encodeURIComponent(error?.message || "oauth_failed")}` } });
  }
}
