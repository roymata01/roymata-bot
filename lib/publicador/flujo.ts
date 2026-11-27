import { createAdminClient } from "@/lib/supabase/admin";
import { guardarVideo, leerVideo, borrarVideo } from "@/lib/publicador/almacen";
import { infoMp4, type InfoVideo } from "@/lib/publicador/mp4-info";
import { escribirCopys, editarCopys, transcribir } from "@/lib/publicador/copy";
import {
  REDES,
  esReelFacebook,
  publicarFacebook,
  publicarInstagram,
  publicarTikTok,
  mandarTikTokBorrador,
  publicarYouTube,
  tiktokDirecto,
  type Copys,
  type Red,
} from "@/lib/publicador/redes";
import {
  avisoPlantillaARoy,
  bajarMediaWhatsApp,
  documentoARoy,
  videoARoy,
  textoARoy,
  ventanaAbiertaRoy,
} from "@/lib/publicador/whatsapp-roy";
import type { InboundMessage } from "@/lib/meta/types";

// LA CADENITA (27-nov-2026)
//  A) Una sesión de Claude en la Mac termina un video → scripts/mandar-video-roy.mjs
//     lo guarda aquí, lo sube a WhatsApp y llama /api/publicaciones/avisar.
//  B) Roy le manda un video (documento o video normal) al WhatsApp del bot.
//  → el bot lo guarda, lo transcribe, escribe los copys y se los manda a Roy.
//  → Roy contesta "publicar" (o pide cambios) → se publica y le llegan los links.
// Nada se publica sin que Roy conteste "publicar" desde SU número.

export type Publicacion = {
  id: string;
  created_at: string;
  origen: "mac" | "whatsapp";
  estado: string;
  nombre_archivo: string | null;
  mime: string | null;
  bytes: number | null;
  partes: number | null;
  duracion: number | null;
  ancho: number | null;
  alto: number | null;
  wa_media_id: string | null;
  wa_tipo: "document" | "video" | null;
  nota_roy: string | null;
  transcripcion: string | null;
  copy: Copys | null;
  redes: Red[] | null;
  resultados: Record<string, Resultado>;
  archivo_borrado_at: string | null;
};
type Resultado = { ok: boolean; link?: string; error?: string; pendiente?: "mac"; borrador?: boolean; at?: string };

const db = () => createAdminClient().from("publicaciones");

async function actualizar(id: string, cambios: Record<string, unknown>) {
  const { error } = await db()
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("publicaciones update:", error);
}

const infoDeFila = (p: Publicacion): InfoVideo | null =>
  p.duracion != null && p.ancho != null && p.alto != null
    ? {
        duracion: Number(p.duracion),
        ancho: p.ancho,
        alto: p.alto,
        vertical: p.alto > p.ancho,
        mb: Math.round(((p.bytes ?? 0) / 1_048_576) * 10) / 10,
      }
    : null;

const NOMBRES: Record<Red, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
};

// ---------------------------------------------------------------- mensajes
function textoCopys(p: Publicacion): string {
  const c = p.copy ?? {};
  const info = infoDeFila(p);
  const partes: string[] = [];
  const datos = info ? ` (${info.duracion} s, ${info.vertical ? "vertical" : "horizontal"}, ${info.mb} MB)` : "";
  partes.push(`🎬 *Copys para:* ${p.nombre_archivo ?? "tu video"}${datos}`);
  if (c.instagram) partes.push(`📸 *INSTAGRAM* (reel)\n${c.instagram}`);
  if (c.facebook) partes.push(`👍 *FACEBOOK* (${info && !esReelFacebook(info) ? "video de la página" : "reel"})\n${c.facebook}`);
  if (c.youtube)
    partes.push(
      `▶️ *YOUTUBE*${info && !(info.vertical && info.duracion <= 180) ? " (video normal, no Short)" : ""}\nTítulo: ${c.youtube.titulo}\n${c.youtube.descripcion ?? ""}`
    );
  if (c.tiktok)
    partes.push(
      `🎵 *TIKTOK*${tiktokDirecto() ? "" : " (te llega como borrador a tu TikTok: solo pegas el copy y publicas)"}\n${c.tiktok}`
    );
  partes.push(
    "Contesta *publicar* y lo subo a todas.\nSi quieres cambiar algo, dime qué y lo corrijo.\nTambién puedes decir *publicar solo en instagram y youtube*, *publicar sin tiktok* o *cancelar*."
  );
  return partes.join("\n\n");
}

/** Manda (o reenvía) los copys; en las del Mac, primero el documento. */
async function mandarCopys(p: Publicacion, conDocumento: boolean) {
  if (conDocumento && p.origen === "mac" && p.wa_media_id) {
    if (p.wa_tipo === "video")
      await videoARoy(p.wa_media_id, "🎬 Vista previa (en las redes se sube en calidad completa)");
    else await documentoARoy(p.wa_media_id, p.nombre_archivo ?? "video.mp4", "🎬 Video listo para publicar (calidad completa)");
  }
  await textoARoy(textoCopys(p));
}

// ---------------------------------------------------------------- preparar
/** Info del video + transcripción + copys (lo que falte). Deja la fila en "lista". */
export async function prepararPublicacion(id: string, videoEnMano?: Buffer): Promise<Publicacion> {
  const p = await leerFila(id);
  if (!p) throw new Error("No existe esa publicación");
  await actualizar(id, { estado: "preparando" });

  const necesitaVideo = !p.copy || p.duracion == null;
  const video = videoEnMano ?? (necesitaVideo ? await leerVideo(id, p.partes ?? 1) : null);

  let info = infoDeFila(p);
  if (!info && video) {
    info = infoMp4(video);
    if (info) await actualizar(id, { duracion: info.duracion, ancho: info.ancho, alto: info.alto });
  }

  let transcripcion = p.transcripcion;
  if (!p.copy && transcripcion == null && video) {
    transcripcion = await transcribir(video, p.nombre_archivo ?? "video.mp4", p.mime ?? "video/mp4");
    await actualizar(id, { transcripcion });
  }

  let copy = p.copy;
  if (!copy) {
    copy = await escribirCopys({
      transcripcion: transcripcion ?? "",
      nota: p.nota_roy,
      nombreArchivo: p.nombre_archivo ?? "video.mp4",
      info,
    });
    await actualizar(id, { copy });
  }
  await actualizar(id, { estado: "lista" });
  return (await leerFila(id))!;
}

async function leerFila(id: string): Promise<Publicacion | null> {
  const { data } = await db().select("*").eq("id", id).maybeSingle();
  return (data as Publicacion) ?? null;
}

// ---------------------------------------------------------------- ruta A (Mac)
/** La Mac ya guardó el video (y casi siempre los copys): avisar a Roy. */
export async function entregarARoy(id: string): Promise<"enviado" | "plantilla"> {
  const p = await prepararPublicacion(id);
  if (await ventanaAbiertaRoy()) {
    await mandarCopys(p, true);
    return "enviado";
  }
  await avisoPlantillaARoy(
    `Tienes un video listo para publicar: ${p.nombre_archivo ?? "video nuevo"}. Contéstame cualquier cosa y te lo mando con los copys de cada red.`
  );
  await actualizar(id, { estado: "esperando_ventana" });
  return "plantilla";
}

// ---------------------------------------------------------------- ruta B (WhatsApp)
type MediaWa = { id: string; mime_type?: string; filename?: string; caption?: string };

function mediaDeVideo(msg: InboundMessage): MediaWa | null {
  const raw = msg.raw as Record<string, unknown>;
  if (msg.mediaType === "video") return (raw.video as MediaWa) ?? null;
  if (msg.mediaType === "document") {
    const d = raw.document as MediaWa | undefined;
    const esVideo = d && ((d.mime_type ?? "").startsWith("video/") || /\.(mp4|mov|m4v)$/i.test(d.filename ?? ""));
    return esVideo ? d! : null;
  }
  return null;
}

async function recibirVideoDeRoy(media: MediaWa) {
  const nombre = media.filename || `video-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.mp4`;
  const { data, error } = await db()
    .insert({ origen: "whatsapp", estado: "recibido", nombre_archivo: nombre, mime: media.mime_type, nota_roy: media.caption ?? null })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No pude registrar el video: ${error?.message}`);
  const id = data.id as string;

  try {
    await textoARoy("🎬 Recibido. Lo estoy viendo y te escribo los copys, dame 1 o 2 minutos.");
    const { bytes, mime } = await bajarMediaWhatsApp(media.id);
    const partes = await guardarVideo(id, bytes);
    await actualizar(id, { bytes: bytes.length, partes, mime });
    const p = await prepararPublicacion(id, bytes);
    await mandarCopys(p, false);
  } catch (e) {
    console.error("recibirVideoDeRoy:", e);
    await actualizar(id, { estado: "error", error: String(e).slice(0, 1000) });
    await textoARoy(`⚠️ No pude preparar el video: ${String(e).slice(0, 300)}`).catch(() => {});
  }
}

// ---------------------------------------------------------------- publicar
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ES_PUBLICAR = /^\s*(ya\s+)?(publica(r|lo|la)?|subelo)\b/;
const ES_CANCELAR = /^\s*(cancela(r|lo)?|no (lo )?publiques|borra(lo)?)\b/;
const ALIAS: Record<Red, RegExp> = {
  instagram: /\b(instagram|insta|ig)\b/,
  facebook: /\b(facebook|face|fb)\b/,
  youtube: /\b(youtube|yt|you tube)\b/,
  tiktok: /\b(tiktok|tik tok|tt)\b/,
};

/** "publicar" → todas; "publicar solo en ig y youtube"; "publicar sin tiktok". */
export function redesPedidas(texto: string): Red[] {
  const t = sinAcentos(texto);
  const mencionadas = REDES.filter((r) => ALIAS[r].test(t));
  if (!mencionadas.length) return [...REDES];
  const quitar = /\b(sin|menos|excepto|no en|no a)\b/.test(t);
  return quitar ? REDES.filter((r) => !mencionadas.includes(r)) : mencionadas;
}

async function publicar(p: Publicacion, redes: Red[]) {
  const resultados: Record<string, Resultado> = { ...(p.resultados ?? {}) };
  const guardar = () => actualizar(p.id, { resultados });
  const copy = p.copy ?? {};

  try {
    const video = await leerVideo(p.id, p.partes ?? 1);
    const info = infoDeFila(p) ?? infoMp4(video) ?? { duracion: 0, ancho: 0, alto: 0, vertical: true, mb: 0 };
    const nombre = p.nombre_archivo ?? "video.mp4";

    const tareas: Promise<void>[] = [];
    const correr = (red: Red, fn: () => Promise<string>) =>
      tareas.push(
        fn()
          .then((link) => {
            resultados[red] = { ok: true, link, at: new Date().toISOString() };
          })
          .catch((e) => {
            console.error(`publicar ${red}:`, e);
            resultados[red] = { ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 500), at: new Date().toISOString() };
          })
          .then(guardar)
      );

    if (redes.includes("instagram") && copy.instagram) correr("instagram", () => publicarInstagram(video, copy.instagram!, info));
    if (redes.includes("facebook") && copy.facebook) correr("facebook", () => publicarFacebook(video, copy.facebook!, info, nombre));
    if (redes.includes("youtube") && copy.youtube) correr("youtube", () => publicarYouTube(video, copy.youtube!));
    if (redes.includes("tiktok") && copy.tiktok) {
      if (tiktokDirecto()) correr("tiktok", () => publicarTikTok(video, copy.tiktok!));
      else {
        // borrador en la bandeja de TikTok; si falla, queda pendiente para la Mac
        tareas.push(
          mandarTikTokBorrador(video)
            .then((link) => {
              resultados.tiktok = { ok: true, link, borrador: true, at: new Date().toISOString() };
            })
            .catch((e) => {
              console.error("tiktok borrador:", e);
              resultados.tiktok = {
                ok: false,
                pendiente: "mac",
                error: String(e instanceof Error ? e.message : e).slice(0, 300),
                at: new Date().toISOString(),
              };
            })
            .then(guardar)
        );
      }
    }
    await Promise.all(tareas);
  } catch (e) {
    console.error("publicar:", e);
    await actualizar(p.id, { estado: "error", error: String(e).slice(0, 1000), resultados });
    await textoARoy(`⚠️ No pude publicar: ${String(e).slice(0, 300)}`).catch(() => {});
    return;
  }

  const pedidas = redes.filter((r) => resultados[r]);
  const ok = pedidas.filter((r) => resultados[r].ok);
  const fallaron = pedidas.filter((r) => !resultados[r].ok && !resultados[r].pendiente);
  const tiktokMac = resultados.tiktok?.pendiente === "mac" && redes.includes("tiktok");
  const estado = fallaron.length === 0 ? "publicado" : ok.length ? "parcial" : "error";
  await actualizar(p.id, { estado, resultados, publicado_at: ok.length ? new Date().toISOString() : null });

  const lineas: string[] = [];
  if (ok.length) lineas.push("✅ *Publicado*");
  for (const r of ok.filter((x) => !resultados[x].borrador)) lineas.push(`${NOMBRES[r]}: ${resultados[r].link}`);
  if (fallaron.length) {
    lineas.push("", "❌ *No se pudo*");
    for (const r of fallaron) lineas.push(`${NOMBRES[r]}: ${resultados[r].error}`);
    lineas.push("", "Contesta *publicar* otra vez para reintentar solo las que fallaron.");
  }
  const tiktokBorrador = redes.includes("tiktok") && resultados.tiktok?.ok && resultados.tiktok.borrador;
  if (tiktokBorrador)
    lineas.push(
      "",
      "🎵 *TikTok*: ya está en tu bandeja de TikTok. Abre TikTok, toca la notificación, pega el copy que te mando abajo y dale Publicar."
    );
  if (tiktokMac)
    lineas.push(
      "",
      `🎵 TikTok: no pude mandarlo a tu bandeja (${resultados.tiktok?.error ?? "error"}). Queda pendiente para la Mac: cuando abras Claude dile *publicar pendientes de TikTok*.`
    );
  await textoARoy(lineas.join("\n").trim());
  // el copy de TikTok solo, para copiarlo y pegarlo fácil
  if (tiktokBorrador && copy.tiktok) await textoARoy(copy.tiktok);

  // El video ya no hace falta (salvo que TikTok lo espere en la Mac o haya que reintentar)
  if (!fallaron.length && !tiktokMac) await borrarVideo(p.id, p.partes ?? 1).catch((e) => console.error("borrarVideo:", e));
}

// ---------------------------------------------------------------- entrada
/**
 * Mensaje del número de Roy al bot. Devuelve true si era para el publicador
 * (video nuevo, "publicar", cambios a los copys, "cancelar"); false si es
 * otra cosa y debe seguir el camino normal de la bandeja.
 */
export async function manejarMensajeRoy(msg: InboundMessage): Promise<boolean> {
  const media = mediaDeVideo(msg);
  if (media) {
    await recibirVideoDeRoy(media);
    return true;
  }
  const texto = (msg.content ?? "").trim();
  if (!texto) return false;

  const hace7dias = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data } = await db()
    .select("*")
    .in("estado", ["esperando_ventana", "preparando", "recibido", "lista", "publicando", "parcial"])
    .gte("created_at", hace7dias)
    .order("created_at", { ascending: false })
    .limit(1);
  const p = (data?.[0] as Publicacion | undefined) ?? null;
  if (!p) return false;

  const t = sinAcentos(texto);
  const pidePublicar = ES_PUBLICAR.test(t);

  if (p.estado === "esperando_ventana") {
    // Roy contestó al aviso: ya se puede mandar el video y los copys
    await actualizar(p.id, { estado: "lista" });
    await mandarCopys(p, true);
    return true;
  }
  if (p.estado === "recibido" || p.estado === "preparando") {
    if (!pidePublicar) return false;
    await textoARoy("Todavía lo estoy preparando, en un momento te mando los copys para que los veas.");
    return true;
  }
  if (p.estado === "publicando") {
    if (!pidePublicar) return false;
    await textoARoy("Ya se está publicando, en cuanto termine te mando los links.");
    return true;
  }

  if (ES_CANCELAR.test(t)) {
    await actualizar(p.id, { estado: "cancelado" });
    await borrarVideo(p.id, p.partes ?? 1).catch(() => {});
    await textoARoy("Listo, no se publica. Lo borré.");
    return true;
  }

  if (pidePublicar) {
    let redes = redesPedidas(texto);
    if (p.estado === "parcial") {
      // reintento: solo lo que falló
      redes = (p.redes ?? REDES).filter(
        (r) => redes.includes(r) && !p.resultados?.[r]?.ok && !p.resultados?.[r]?.pendiente
      );
      if (!redes.length) return false;
    }
    if (p.archivo_borrado_at) {
      await textoARoy("Ese video ya no lo tengo guardado. Mándamelo otra vez y lo preparo.");
      return true;
    }
    // candado: solo una publicación a la vez aunque Roy mande "publicar" dos veces
    const { data: tomada } = await db()
      .update({ estado: "publicando", redes, aprobado_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", p.id)
      .eq("estado", p.estado)
      .select("id");
    if (!tomada?.length) return true;
    await textoARoy(`🚀 Va. Publicando en ${redes.map((r) => NOMBRES[r]).join(", ")}. Te mando los links en unos minutos.`);
    await publicar(p, redes);
    return true;
  }

  if (p.estado !== "lista") return false;
  const nuevos = await editarCopys({
    copys: p.copy ?? {},
    instruccion: texto,
    transcripcion: p.transcripcion ?? "",
    info: infoDeFila(p),
  });
  if (!nuevos) return false;
  await actualizar(p.id, { copy: nuevos });
  await mandarCopys({ ...p, copy: nuevos }, false);
  return true;
}
