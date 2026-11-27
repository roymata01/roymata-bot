import { createAdminClient } from "@/lib/supabase/admin";

// Llaves para PUBLICAR (no las de mensajería): viven en el storage privado
// config/publicador-tokens.json — igual que el token de Instagram — para no
// tener que pegarlas a mano en Vercel. Las variables de entorno con el mismo
// nombre ganan si existen.
//   FB_PUBLICAR_TOKEN  token de página permanente con pages_manage_posts
//   YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN  canal @roymata01

export type TokensPublicador = {
  FB_PUBLICAR_TOKEN?: string;
  YT_CLIENT_ID?: string;
  YT_CLIENT_SECRET?: string;
  YT_REFRESH_TOKEN?: string;
};

let cache: { t: TokensPublicador; at: number } | null = null;

export async function tokensPublicador(): Promise<TokensPublicador> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.t;
  let guardados: TokensPublicador = {};
  try {
    const { data } = await createAdminClient().storage.from("config").download("publicador-tokens.json");
    if (data) guardados = JSON.parse(await data.text());
  } catch (e) {
    console.error("tokensPublicador:", e);
  }
  const t: TokensPublicador = {};
  for (const k of ["FB_PUBLICAR_TOKEN", "YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"] as const) {
    t[k] = process.env[k] || guardados[k];
  }
  cache = { t, at: Date.now() };
  return t;
}
