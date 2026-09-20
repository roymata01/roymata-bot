import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchInstagramProfile, fetchMessengerProfile } from "@/lib/meta/fetch-profile";
import { cacheAvatar, avatarVigente } from "@/lib/meta/cache-avatar";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Rescate de fotos de perfil (una vez, por lotes): re-pide a Meta la foto de
// los contactos con conversación reciente y la cachea en el bucket "avatares".
// Corre AQUÍ y no en local porque los tokens de página viven en el env de
// producción. Se llama repetidamente con CRON_SECRET hasta que devuelva 0.

const LOTE = 25;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: convos } = await supabase
    .from("conversations")
    .select("contact_id")
    .in("channel", ["instagram", "messenger"])
    .order("last_message_at", { ascending: false })
    .limit(600);

  const ids = [...new Set((convos ?? []).map((c) => c.contact_id))];
  const contactos: { id: string; channel: string; external_id: string; avatar_url: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from("contacts")
      .select("id, channel, external_id, avatar_url")
      .in("id", ids.slice(i, i + 100));
    contactos.push(...(data ?? []));
  }
  const pendientes = contactos.filter((c) => !avatarVigente(c.avatar_url) && c.avatar_url !== "sin-foto");

  let ok = 0, sinFoto = 0, fallo = 0;
  for (const c of pendientes.slice(0, LOTE)) {
    try {
      const perfil =
        c.channel === "instagram"
          ? await fetchInstagramProfile(c.external_id)
          : await fetchMessengerProfile(c.external_id);
      if (!perfil.avatarUrl) {
        sinFoto++;
        // marcador para no reintentarla en cada lote (el front la ignora)
        await supabase.from("contacts").update({ avatar_url: "sin-foto" }).eq("id", c.id);
        continue;
      }
      const url = await cacheAvatar(c.channel, c.external_id, perfil.avatarUrl);
      if (url) {
        await supabase.from("contacts").update({ avatar_url: url }).eq("id", c.id);
        ok++;
      } else fallo++;
    } catch {
      fallo++;
    }
  }

  return NextResponse.json({
    ok: true,
    rescatadas: ok,
    sin_foto: sinFoto,
    fallos: fallo,
    pendientes_restantes: Math.max(0, pendientes.length - LOTE),
  });
}
