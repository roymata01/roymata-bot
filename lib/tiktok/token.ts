import { createAdminClient } from "@/lib/supabase/admin";

// Conexión con TikTok (app VITA - ROY). El token vive en el storage privado
// (bucket config), igual que el de Instagram: el env de Vercel no puede
// actualizarse solo y los access tokens de TikTok duran 24 h — se refrescan
// con el refresh_token (dura ~1 año) cada vez que hace falta.

const ARCHIVO = "tiktok-token.json";
const API = "https://open.tiktokapis.com/v2";

export type TikTokToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms del access token
  open_id: string;
  display_name?: string;
  avatar_url?: string;
};

export function tiktokConfigurado(): boolean {
  return !!process.env.TIKTOK_CLIENT_KEY && !!process.env.TIKTOK_CLIENT_SECRET;
}

export async function leerTokenTikTok(): Promise<TikTokToken | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.storage.from("config").download(ARCHIVO);
    if (!data) return null;
    return JSON.parse(await data.text()) as TikTokToken;
  } catch {
    return null;
  }
}

export async function guardarTokenTikTok(token: TikTokToken): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from("config")
    .upload(ARCHIVO, new Blob([JSON.stringify(token)], { type: "application/json" }), { upsert: true });
  if (error) throw error;
}

export async function borrarTokenTikTok(): Promise<void> {
  await createAdminClient().storage.from("config").remove([ARCHIVO]);
}

/** Access token vigente, refrescándolo si ya caducó (margen de 5 min). */
export async function accessTokenTikTok(): Promise<TikTokToken | null> {
  const token = await leerTokenTikTok();
  if (!token) return null;
  if (Date.now() < token.expires_at - 5 * 60_000) return token;

  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    }),
  });
  if (!res.ok) {
    console.error("TikTok refresh falló:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const renovado: TikTokToken = {
    ...token,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? token.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 86400) * 1000,
  };
  await guardarTokenTikTok(renovado);
  return renovado;
}
