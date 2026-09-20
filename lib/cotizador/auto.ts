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
    lugar,
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

  // Web y chat entran por igual, y TODOS reciben cotización (pedido de Roy
  // 2026-09-20): pida el curso que pida, se cotiza el único activo del
  // catálogo (Primeros auxilios básicos). Solo frenan la falta de correo o
  // un grupo fuera de rango.
  const personas = Number(solicitud.num_personas);
  if (!Number.isFinite(personas) || personas < 10 || personas > 120) {
    return { apto: false, razon: `grupo de ${solicitud.num_personas ?? "?"} personas (fuera de 10-120)` };
  }
  const correo = (solicitud.correo || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { apto: false, razon: "sin correo válido" };

  // El único curso del cotizador, sin importar qué pidieron
  const { data: curso } = await supabase
    .from("cotizador_cursos")
    .select("nombre, precio_unitario")
    .eq("activo", true)
    .limit(1)
    .maybeSingle();
  if (!curso) return { apto: false, razon: "no hay curso activo en el catálogo" };

  // Viáticos según el caso (regla de Roy 2026-09-20):
  //  · Extranjero → $0 y nota de curso EN LÍNEA
  //  · México con tarifa → la tarifa del estado (Puebla capital tiene fila propia)
  //  · México sin tarifa clara o sin lugar → $0 y nota "viáticos por definir"
  const esExtranjero = /FUERA DE M[EÉ]XICO/i.test(notas) || (!!datos.lugar && !datos.esMexico);
  let viaticos = 0;
  let notaExtra = "";
  let modalidad = "presencial";
  if (esExtranjero) {
    notaExtra = "Curso impartido EN LÍNEA, en vivo por Zoom (sin costo de viáticos)";
    modalidad = "en línea (extranjero)";
  } else {
    const llaveTarifa =
      datos.estado === "Puebla" && /^puebla$/i.test(datos.ciudad) ? "Puebla (capital)" : datos.estado;
    const { data: tarifa } = llaveTarifa
      ? await supabase.from("cotizador_tarifas").select("estado, viaticos").eq("estado", llaveTarifa).maybeSingle()
      : { data: null };
    if (tarifa) {
      viaticos = Number(tarifa.viaticos) || 0;
    } else {
      notaExtra = "Viáticos por definir en caso de confirmar el curso";
      modalidad = "viáticos por definir";
    }
  }

  // Generar el PDF con el pipeline real (folio oficial, borrador ligado)
  const res = await fetch("https://sistema.vitarescue.com.mx/api/cotizaciones/generar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({
      quote_request_id: solicitud.id,
      dirigida: solicitud.organizacion || solicitud.nombre || "Cliente",
      num_personas: personas,
      precio_unitario: Number(curso.precio_unitario),
      viaticos,
      instructor_roy: datos.instructorRoy,
      extra_descripcion: notaExtra,
      extra_monto: 0,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.cotizacion) return { apto: false, razon: `falló la generación (${res.status})` };

  const c = data.cotizacion as { id: string; folio: number; total: number };
  const resumen = [
    solicitud.organizacion || solicitud.nombre || "Cliente",
    `${personas} personas`,
    curso.nombre,
    datos.lugar || "lugar sin especificar",
    viaticos ? `viáticos $${viaticos.toLocaleString("es-MX")}` : modalidad,
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
