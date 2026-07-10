import { createAdminClient } from "@/lib/supabase/admin";
import { handleInstagramComment } from "@/lib/inbox/handle-instagram-comment";

const GRAPH = "https://graph.instagram.com/v23.0";

// Barrida de comentarios de Instagram: los comentarios de cuentas PRIVADAS no
// generan webhook (limitación de Meta), pero sí se pueden leer por la API de
// nuestros propios posts. Esta barrida (cron diario) revisa los comentarios de
// los últimos 7 días — la ventana en que Meta aún permite la private reply — y
// le manda la invitación a quien el webhook se haya saltado.
//
// Límite por corrida + espaciado entre envíos: que el patrón se vea humano y no
// dispare los sistemas anti-spam de Instagram.
const MAX_ENVIOS_POR_CORRIDA = 10;
const ESPACIO_ENTRE_ENVIOS_MS = 3000;
const DIAS_VENTANA = 7;

async function graphGet(path: string): Promise<Record<string, unknown>> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}${path}${sep}access_token=${process.env.IG_PAGE_ACCESS_TOKEN}`);
  if (!res.ok) throw new Error(`Graph API falló (${path.split("?")[0]}): ${res.status} ${await res.text()}`);
  return res.json();
}

export async function sweepInstagramComments() {
  const supabase = createAdminClient();

  const { data: settings } = await supabase.from("assistant_settings").select("*").eq("id", 1).single();
  const config = settings as { comment_dm_enabled?: boolean; is_paused?: boolean } | null;
  if (!config?.comment_dm_enabled || config.is_paused) {
    return { estado: "apagado", revisados: 0, enviados: 0 };
  }

  // identidad propia: nunca invitarse a sí mismo
  const me = (await graphGet("/me?fields=id,username")) as { id: string; username: string };

  // todo lo ya invitado (por webhook o por barridas anteriores)
  const { data: invitados } = await supabase.from("comment_invites").select("comment_id, ig_user_id");
  const comentariosVistos = new Set((invitados ?? []).map((i) => i.comment_id));
  const usuariosInvitados = new Set((invitados ?? []).map((i) => i.ig_user_id));

  const corte = Date.now() - DIAS_VENTANA * 24 * 60 * 60 * 1000;
  const media = (await graphGet("/me/media?fields=id,timestamp&limit=25")) as {
    data: { id: string; timestamp: string }[];
  };

  let revisados = 0;
  let enviados = 0;

  for (const m of media.data ?? []) {
    if (enviados >= MAX_ENVIOS_POR_CORRIDA) break;

    const comments = (await graphGet(`/${m.id}/comments?fields=id,from,text,timestamp&limit=50`)) as {
      data: { id: string; from?: { id: string; username?: string }; text?: string; timestamp: string }[];
    };

    for (const c of comments.data ?? []) {
      if (enviados >= MAX_ENVIOS_POR_CORRIDA) break;
      if (new Date(c.timestamp).getTime() < corte) continue;
      revisados++;

      if (!c.from?.id) continue; // sin identidad no hay a quién escribirle
      if (c.from.id === me.id || c.from.username === me.username) continue;
      if (comentariosVistos.has(c.id) || usuariosInvitados.has(c.from.id)) continue;

      await handleInstagramComment({
        commentId: c.id,
        mediaId: m.id,
        userId: c.from.id,
        username: c.from.username ?? null,
        text: c.text ?? null,
        raw: { origen: "barrida", comment: c },
      });
      usuariosInvitados.add(c.from.id);
      enviados++;

      await new Promise((r) => setTimeout(r, ESPACIO_ENTRE_ENVIOS_MS));
    }
  }

  return { estado: "ok", revisados, enviados };
}
