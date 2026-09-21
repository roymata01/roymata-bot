import { createAdminClient } from "@/lib/supabase/admin";

// El token de Instagram vive en el storage (bucket privado config/ig-token.json)
// y un cron semanal lo renueva ANTES de que caduque — porque el env de Vercel
// no puede actualizarse solo, y en agosto-2026 el token murió en silencio y el
// bot pasó 3 semanas mudo en DMs de IG sin que nadie lo notara.
// Fallback: la variable de entorno (por si el storage falla).

let cache: { token: string; at: number } | null = null;

export async function igToken(): Promise<string> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.token;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.storage.from("config").download("ig-token.json");
    if (data) {
      const { token } = JSON.parse(await data.text());
      if (token) {
        cache = { token, at: Date.now() };
        return token;
      }
    }
  } catch (e) {
    console.error("igToken storage:", e);
  }
  return process.env.IG_PAGE_ACCESS_TOKEN || "";
}

export async function guardarIgToken(token: string, origen: string): Promise<void> {
  const supabase = createAdminClient();
  const cuerpo = JSON.stringify({ token, actualizado: new Date().toISOString(), origen });
  const { error } = await supabase.storage
    .from("config")
    .upload("ig-token.json", new Blob([cuerpo], { type: "application/json" }), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw new Error(`No pude guardar el token: ${error.message}`);
  cache = { token, at: Date.now() };
}
