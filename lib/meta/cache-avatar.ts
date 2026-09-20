import { createAdminClient } from "@/lib/supabase/admin";

// Las fotos de perfil de Meta vienen de su CDN con firma QUE CADUCA (días):
// guardarlas tal cual deja el inbox lleno de imágenes rotas 403. Aquí se
// descarga la foto UNA vez y se sube a nuestro bucket público "avatares" —
// esa URL es nuestra y no caduca jamás. Nunca lanza: sin foto no pasa nada.

export async function cacheAvatar(
  channel: string,
  externalId: string,
  cdnUrl: string | null | undefined
): Promise<string | null> {
  if (!cdnUrl) return null;
  try {
    const res = await fetch(cdnUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const tipo = res.headers.get("content-type") || "image/jpeg";
    if (!tipo.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > 2_000_000) return null;

    const supabase = createAdminClient();
    const ruta = `${channel}/${externalId}.jpg`;
    const { error } = await supabase.storage
      .from("avatares")
      .upload(ruta, bytes, { contentType: tipo, upsert: true });
    if (error) {
      console.error("cacheAvatar upload:", error.message);
      return null;
    }
    const { data } = supabase.storage.from("avatares").getPublicUrl(ruta);
    return data.publicUrl ?? null;
  } catch (e) {
    console.error("cacheAvatar:", e);
    return null;
  }
}

/** Una URL de avatar sirve solo si es nuestra; las del CDN de Meta caducan. */
export function avatarVigente(url: string | null | undefined): boolean {
  return !!url && url.includes("/storage/v1/object/public/avatares/");
}
