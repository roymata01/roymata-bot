import { NextRequest, NextResponse } from "next/server";
import { guardarTokenTikTok, type TikTokToken } from "@/lib/tiktok/token";

const API = "https://open.tiktokapis.com/v2";

// Regreso del OAuth de TikTok: cambia el code por tokens, trae el perfil y
// guarda todo en el storage (config/tiktok-token.json).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const esperado = req.cookies.get("tiktok_oauth_state")?.value;
  const aPanel = (q: string) => NextResponse.redirect(new URL(`/tiktok?${q}`, req.nextUrl.origin));

  if (!code) return aPanel(`error=${encodeURIComponent(req.nextUrl.searchParams.get("error_description") ?? "sin code")}`);
  if (!state || state !== esperado) return aPanel("error=state");

  try {
    const res = await fetch(`${API}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.TIKTOK_REDIRECT_URI ?? `${req.nextUrl.origin}/api/tiktok/callback`,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      console.error("TikTok token exchange:", data);
      return aPanel(`error=${encodeURIComponent(data.error_description ?? data.error ?? "token")}`);
    }

    const token: TikTokToken = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in ?? 86400) * 1000,
      open_id: data.open_id,
    };

    // Perfil para mostrar en el panel (nombre + avatar)
    try {
      const perfil = await fetch(`${API}/user/info/?fields=open_id,display_name,avatar_url`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      }).then((r) => r.json());
      token.display_name = perfil?.data?.user?.display_name;
      token.avatar_url = perfil?.data?.user?.avatar_url;
    } catch {
      // sin perfil no pasa nada, la conexión ya quedó
    }

    await guardarTokenTikTok(token);
    return aPanel("conectado=1");
  } catch (e) {
    console.error("TikTok callback:", e);
    return aPanel("error=callback");
  }
}
