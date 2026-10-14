import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Arranca el OAuth de TikTok (Login Kit): manda a Roy a autorizar la app
// VITA - ROY sobre su propia cuenta. El state anti-CSRF viaja en cookie.
export async function GET(req: NextRequest) {
  const state = crypto.randomBytes(16).toString("hex");
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", process.env.TIKTOK_CLIENT_KEY ?? "");
  url.searchParams.set("response_type", "code");
  // Solo los scopes de ESTA revisión: el video.publish (Direct Post) se
  // pedirá en una revisión posterior — sin auditar, TikTok solo deja publicar
  // directo en cuentas privadas y Roy no va a privatizar @roymata01.
  url.searchParams.set("scope", "user.info.basic,video.upload");
  url.searchParams.set("redirect_uri", process.env.TIKTOK_REDIRECT_URI ?? `${req.nextUrl.origin}/api/tiktok/callback`);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("tiktok_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
