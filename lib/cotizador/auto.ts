import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Cotizador automático NIVEL 1: al llegar una solicitud "estándar" genera el
// PDF solo (precio del catálogo + viáticos del tarifario) y se lo manda a Roy
// por WhatsApp con botón de aprobar. NUNCA envía nada al cliente sin ese OK.
// Si algo no cuadra (otro país, curso desconocido, sin correo, grupo fuera de
// rango), NO genera y la alerta normal le dice a Roy que la haga a mano.

type QuoteRow = {
  id: string;
  nombre: string | null;
  organizacion: string | null;
  num_personas: number | null;
  correo: string | null;
  notas: string | null;
  conversation_id: string | null;
};

export type EvaluacionAuto =
  | { apto: false; razon: string }
  | {
      apto: true;
      cotizacionId: string;
      folio: number;
      total: number;
      resumen: string;
      linkAprobar: string;
    };

export function firmaAprobacion(cotizacionId: string): string {
  return createHmac("sha256", process.env.CRON_SECRET || "")
    .update(`aprobar:${cotizacionId}`)
    .digest("hex")
    .slice(0, 16);
}

// El formulario /cotizar guarda en notas: "🌐 Solicitud desde la página ·
// Lugar: Ciudad, Estado, México · Curso: X · Instructor Roy: SÍ/no · ..."
function parseNotas(notas: string) {
  const lugar = notas.match(/Lugar:\s*([^·]+)/)?.[1]?.trim() ?? "";
  const curso = notas.match(/Curso:\s*([^·]+)/)?.[1]?.trim() ?? "";
  const instructorRoy = /Instructor Roy:\s*S[ÍI]/i.test(notas);
  const partes = lugar.split(",").map((p) => p.trim());
  const esMexico = /m[eé]xico$/i.test(lugar) && !/FUERA DE M[EÉ]XICO/i.test(lugar);
  return {
    esWeb: notas.includes("Solicitud desde la página"),
    esMexico,
    ciudad: partes[0] ?? "",
    estado: partes.length >= 3 ? partes[1] : "",
    curso,
    instructorRoy,
  };
}

export async function evaluarYGenerar(solicitud: QuoteRow): Promise<EvaluacionAuto> {
  const supabase = createAdminClient();
  const notas = solicitud.notas || "";
  const datos = parseNotas(notas);

  // Web y chat entran por igual: lo que importa es que los datos estén
  // completos, no de dónde vinieron (pedido de Roy 2026-09-20 tras encontrar
  // chats con la cotización prometida y nunca enviada).
  if (!datos.esMexico) return { apto: false, razon: "fuera de México o sin lugar claro (precio manual)" };
  const personas = Number(solicitud.num_personas);
  if (!Number.isFinite(personas) || personas < 10 || personas > 120) {
    return { apto: false, razon: `grupo de ${solicitud.num_personas ?? "?"} personas (fuera de 10-120)` };
  }
  const correo = (solicitud.correo || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { apto: false, razon: "sin correo válido" };

  // Curso en el catálogo — tolerante a variaciones del chat ("primeros
  // auxilios basicos" debe encontrar "Primeros auxilios básicos en adultos")
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const { data: activos } = await supabase
    .from("cotizador_cursos")
    .select("nombre, precio_unitario")
    .eq("activo", true);
  const pedido = norm(datos.curso);
  const curso = (activos ?? []).find((c) => {
    const cat = norm(c.nombre);
    return cat === pedido || cat.includes(pedido) || pedido.includes(cat) ||
      // coincide si comparten el arranque ("primeros auxilios basicos…")
      (pedido.length >= 12 && cat.startsWith(pedido.slice(0, 12)));
  });
  if (!pedido || !curso) return { apto: false, razon: `curso "${datos.curso || "?"}" fuera del catálogo` };

  // Viáticos del tarifario (Puebla capital tiene fila propia)
  const llaveTarifa =
    datos.estado === "Puebla" && /^puebla$/i.test(datos.ciudad) ? "Puebla (capital)" : datos.estado;
  const { data: tarifa } = await supabase
    .from("cotizador_tarifas")
    .select("estado, viaticos")
    .eq("estado", llaveTarifa)
    .maybeSingle();
  if (!tarifa) return { apto: false, razon: `sin tarifa de viáticos para "${llaveTarifa}"` };

  // Generar el PDF con el pipeline real (folio oficial, borrador ligado)
  const res = await fetch("https://sistema.vitarescue.com.mx/api/cotizaciones/generar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({
      quote_request_id: solicitud.id,
      dirigida: solicitud.organizacion || solicitud.nombre || "Cliente",
      num_personas: personas,
      precio_unitario: Number(curso.precio_unitario),
      viaticos: Number(tarifa.viaticos) || 0,
      instructor_roy: datos.instructorRoy,
      extra_descripcion: "",
      extra_monto: 0,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.cotizacion) return { apto: false, razon: `falló la generación (${res.status})` };

  const c = data.cotizacion as { id: string; folio: number; total: number };
  const resumen = [
    solicitud.organizacion || solicitud.nombre || "Cliente",
    `${personas} personas`,
    `${datos.curso}`,
    `${datos.ciudad}, ${datos.estado}`,
    `viáticos $${Number(tarifa.viaticos).toLocaleString("es-MX")}`,
    datos.instructorRoy ? "con Roy (+$5,000)" : null,
    `TOTAL $${Number(c.total).toLocaleString("es-MX")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    apto: true,
    cotizacionId: c.id,
    folio: c.folio,
    total: c.total,
    resumen,
    linkAprobar: `${c.id}-${firmaAprobacion(c.id)}`,
  };
}
