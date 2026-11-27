import { createAdminClient } from "@/lib/supabase/admin";

// Los videos se guardan en el bucket PRIVADO "publicaciones". El proyecto tiene
// el límite global de 50 MB por archivo, así que cada video se parte en
// trozos de 45 MB (publicaciones/<id>/parte-000, -001…) y se vuelve a juntar en
// memoria al publicar. WhatsApp no pasa de 100 MB, así que son 1–3 partes.

export const BUCKET = "publicaciones";
const PARTE = 45 * 1024 * 1024;

const ruta = (id: string, i: number) => `${id}/parte-${String(i).padStart(3, "0")}`;

export async function guardarVideo(id: string, video: Buffer): Promise<number> {
  const supabase = createAdminClient();
  const partes = Math.max(1, Math.ceil(video.length / PARTE));
  for (let i = 0; i < partes; i++) {
    const trozo = video.subarray(i * PARTE, Math.min(video.length, (i + 1) * PARTE));
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(ruta(id, i), trozo, { contentType: "application/octet-stream", upsert: true });
    if (error) throw new Error(`No pude guardar la parte ${i + 1} del video: ${error.message}`);
  }
  return partes;
}

export async function leerVideo(id: string, partes: number): Promise<Buffer> {
  const supabase = createAdminClient();
  const trozos: Buffer[] = [];
  for (let i = 0; i < partes; i++) {
    const { data, error } = await supabase.storage.from(BUCKET).download(ruta(id, i));
    if (error || !data) throw new Error(`No encontré la parte ${i + 1} del video (tal vez ya se borró)`);
    trozos.push(Buffer.from(await data.arrayBuffer()));
  }
  return Buffer.concat(trozos);
}

export async function borrarVideo(id: string, partes: number): Promise<void> {
  const supabase = createAdminClient();
  const rutas = Array.from({ length: Math.max(1, partes) }, (_, i) => ruta(id, i));
  await supabase.storage.from(BUCKET).remove(rutas);
  await supabase.from("publicaciones").update({ archivo_borrado_at: new Date().toISOString() }).eq("id", id);
}
