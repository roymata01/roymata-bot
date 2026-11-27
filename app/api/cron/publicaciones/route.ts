import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { borrarVideo } from "@/lib/publicador/almacen";
import { textoARoy } from "@/lib/publicador/whatsapp-roy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Limpieza diaria del publicador: el plan gratis de Supabase tiene 1 GB, así
// que los videos de más de 7 días (o cancelados) se borran del bucket. La fila
// se queda como bitácora. Si una publicación se quedó trabada "publicando"
// más de una hora (la función se cortó), se marca error y se avisa a Roy.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const db = createAdminClient().from("publicaciones");
  const hace7 = new Date(Date.now() - 7 * 86400_000).toISOString();
  const hace1h = new Date(Date.now() - 3600_000).toISOString();

  const { data: viejas } = await db
    .select("id, partes, estado, created_at")
    .is("archivo_borrado_at", null)
    .or(`created_at.lt.${hace7},estado.eq.cancelado`);
  let borradas = 0;
  for (const p of viejas ?? []) {
    if (p.estado === "publicando") continue;
    await borrarVideo(p.id, p.partes ?? 1).catch((e) => console.error("limpieza:", e));
    borradas++;
  }

  const { data: trabadas } = await createAdminClient()
    .from("publicaciones")
    .select("id, nombre_archivo")
    .eq("estado", "publicando")
    .lt("aprobado_at", hace1h);
  for (const p of trabadas ?? []) {
    await createAdminClient()
      .from("publicaciones")
      .update({ estado: "parcial", error: "se cortó mientras publicaba", updated_at: new Date().toISOString() })
      .eq("id", p.id);
    await textoARoy(
      `⚠️ La publicación de ${p.nombre_archivo ?? "tu video"} se cortó a medias. Contesta *publicar* para reintentar lo que faltó.`
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, borradas, trabadas: trabadas?.length ?? 0 });
}
