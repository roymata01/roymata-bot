import { sugerirCorreo } from "@/lib/email-typos";

// Motor de seguimiento de cotizaciones.
//
// Una cotización enviada y sin respuesta se enfría sola: nadie la vuelve a
// tocar y el trato se pierde en silencio. Este módulo decide a quién le toca
// un recordatorio hoy y con qué texto, sin mandar nada por su cuenta —
// enviar es trabajo del cron, para que la decisión se pueda probar aparte.

/** Cuándo va cada recordatorio, contando desde que se envió la cotización. */
export const PASOS = [
  { paso: 1, dias: 3 },
  { paso: 2, dias: 7 },
  { paso: 3, dias: 14 },
] as const;

export type CotizacionSeg = {
  id: string;
  folio: number;
  dirigida: string | null;
  num_personas: number | null;
  total: number | null;
  estado: string | null;
  seguimiento_pausado?: boolean | null;
  quote_request_id: string | null;
};
export type CorreoSeg = { cotizacion_id: string | null; folio: number | null; direction: string | null; to_email: string | null; created_at: string | null };
export type SeguimientoHecho = { cotizacion_id: string; paso: number };
export type SolicitudSeg = { id: string; etapa: string | null; nombre?: string | null; organizacion?: string | null; telefono?: string | null; num_personas?: number | null };

export type Pendiente = {
  cotizacion: CotizacionSeg;
  paso: number;
  diasDesdeEnvio: number;
  destino: string;
};

/** Lo que NO se pudo mandar y Roy tiene que ver. */
export type Bloqueado = { folio: number; dirigida: string | null; destino: string; motivo: string; sugerencia?: string };

// Cuentas de la casa: cotizaciones de prueba que Roy se manda a sí mismo.
// Sin esto, el motor le escribiría a su propio dueño como si fuera cliente.
const INTERNOS = [
  "vitarescue.com.mx", "roymataparamedic@gmail.com", "matasantillana707@gmail.com",
  "roymata@test.com",
];
/** El WhatsApp de Roy: sus propias cotizaciones de prueba no son clientes. */
const TELEFONOS_INTERNOS = ["2228067240"];
export function telefonoInterno(tel: string | null | undefined) {
  const d = String(tel ?? "").replace(/\D/g, "");
  return d.length >= 10 && TELEFONOS_INTERNOS.includes(d.slice(-10));
}

export function esInterno(correo: string) {
  const e = correo.toLowerCase().trim();
  return INTERNOS.some((x) => (x.includes("@") ? e === x : e.endsWith("@" + x)));
}

const dias = (desde: string) => Math.floor((Date.now() - new Date(desde).getTime()) / 86400000);

/**
 * Decide qué recordatorios toca mandar hoy.
 *
 * Se detiene —y esto es lo importante— en cuanto el cliente contesta, cuando
 * Roy marca el trato como ganado o perdido, y cuando él apaga el seguimiento
 * a mano. Nunca repite un paso ya enviado.
 */
export function pendientesDeHoy(datos: {
  cotizaciones: CotizacionSeg[];
  correos: CorreoSeg[];
  hechos: SeguimientoHecho[];
  solicitudes: SolicitudSeg[];
}): Pendiente[] {
  const { cotizaciones, correos, hechos, solicitudes } = datos;

  const etapaDe = new Map(solicitudes.map((s) => [s.id, s.etapa]));
  const yaHecho = new Set(hechos.map((h) => `${h.cotizacion_id}:${h.paso}`));

  // El cliente contestó si existe aunque sea un correo entrante de ese folio.
  const contestaron = new Set(
    correos.filter((c) => c.direction === "in" && c.folio != null).map((c) => c.folio)
  );

  const salida: Pendiente[] = [];

  for (const cot of cotizaciones) {
    if (cot.estado === "borrador") continue;          // ni siquiera se ha enviado
    if (cot.seguimiento_pausado) continue;            // Roy lo apagó
    if (contestaron.has(cot.folio)) continue;         // ya hubo respuesta: para
    const etapa = cot.quote_request_id ? etapaDe.get(cot.quote_request_id) : null;
    if (etapa === "ganada" || etapa === "perdida") continue; // caso cerrado

    // El envío real es el primer correo SALIENTE del folio; la fecha de la
    // cotización no sirve, porque puede generarse días antes de mandarse.
    const salientes = correos
      .filter((c) => c.cotizacion_id === cot.id && c.direction === "out" && c.created_at)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const primero = salientes[0];
    if (!primero?.created_at || !primero.to_email) continue; // se envió por chat, no por correo

    const transcurridos = dias(primero.created_at);
    // El paso que corresponde: el más avanzado cuyo plazo ya se cumplió.
    const toca = [...PASOS].reverse().find((p) => transcurridos >= p.dias);
    if (!toca) continue;
    if (yaHecho.has(`${cot.id}:${toca.paso}`)) continue;

    salida.push({ cotizacion: cot, paso: toca.paso, diasDesdeEnvio: transcurridos, destino: primero.to_email });
  }
  return salida;
}

/**
 * Limpia la lista antes de mandar nada. Tres reglas que nacieron de mirar los
 * datos reales, no de suponer:
 *
 * 1. Nada a cuentas de la casa (había una cotización de prueba de $141,000).
 * 2. Nada a correos mal escritos: rebotan y ensucian la reputación del dominio.
 * 3. Un solo correo por persona: dos colegios distintos tenían el MISMO correo
 *    con folios diferentes, y habrían recibido dos recordatorios el mismo día.
 */
export function filtrar(pendientes: Pendiente[]): { envios: Pendiente[]; bloqueados: Bloqueado[] } {
  const bloqueados: Bloqueado[] = [];
  const limpios: Pendiente[] = [];

  for (const p of pendientes) {
    const base = { folio: p.cotizacion.folio, dirigida: p.cotizacion.dirigida, destino: p.destino };
    if (esInterno(p.destino)) {
      bloqueados.push({ ...base, motivo: "es una cuenta tuya, no un cliente" });
      continue;
    }
    const sugerido = sugerirCorreo(p.destino);
    if (sugerido) {
      bloqueados.push({ ...base, motivo: "el correo está mal escrito y rebotaría", sugerencia: sugerido });
      continue;
    }
    limpios.push(p);
  }

  // Un correo por destinatario: se queda el folio más reciente, que es la
  // cotización que el cliente tiene más fresca.
  const porDestino = new Map<string, Pendiente>();
  for (const p of limpios) {
    const clave = p.destino.toLowerCase();
    const previo = porDestino.get(clave);
    if (!previo || p.cotizacion.folio > previo.cotizacion.folio) {
      if (previo) {
        bloqueados.push({
          folio: previo.cotizacion.folio, dirigida: previo.cotizacion.dirigida, destino: previo.destino,
          motivo: `mismo correo que S${p.cotizacion.folio}; se manda solo el folio más reciente`,
        });
      }
      porDestino.set(clave, p);
    } else {
      bloqueados.push({
        folio: p.cotizacion.folio, dirigida: p.cotizacion.dirigida, destino: p.destino,
        motivo: `mismo correo que S${previo.cotizacion.folio}; se manda solo el folio más reciente`,
      });
    }
  }
  return { envios: [...porDestino.values()], bloqueados };
}

/** Nombre utilizable para saludar, sin quedar como "Hola Sin nombre,". */
function saludo(dirigida: string | null) {
  const n = String(dirigida ?? "").trim();
  if (!n || /^sin nombre$/i.test(n)) return "Hola,";
  return `Hola ${n.split(/\s+/).slice(0, 2).join(" ")},`;
}

/**
 * El texto de cada recordatorio, en la voz de Roy: directo, servicial y sin
 * presión. El tercero cierra el ciclo en vez de insistir para siempre.
 */
export function redactar(p: Pendiente): { asunto: string; html: string; texto: string } {
  const c = p.cotizacion;
  const personas = c.num_personas ? `${c.num_personas} persona${c.num_personas === 1 ? "" : "s"}` : "tu grupo";
  const hola = saludo(c.dirigida);

  const cuerpos: Record<number, { asunto: string; parrafos: string[] }> = {
    1: {
      asunto: `Re: Cotización S${c.folio} — ¿te llegó bien?`,
      parrafos: [
        `${hola}`,
        `Te escribo nada más para confirmar que te haya llegado la cotización <strong>S${c.folio}</strong> del curso de primeros auxilios para ${personas}. A veces estos correos se van a la carpeta de no deseados.`,
        `Si tienes cualquier duda sobre el temario, la duración o las fechas, respóndeme este mismo correo y con gusto te explico.`,
      ],
    },
    2: {
      asunto: `Re: Cotización S${c.folio} — ¿resolvemos alguna duda?`,
      parrafos: [
        `${hola}`,
        `Sigo pendiente de la cotización <strong>S${c.folio}</strong> para ${personas}.`,
        `Si el presupuesto o la fecha no te acomodan, dímelo con confianza: casi siempre encontramos cómo ajustarlo. Podemos dar el curso en tus instalaciones, o dividir al grupo en dos turnos para no parar la operación.`,
        `Si prefieres platicarlo por teléfono, contéstame este correo con tu horario y yo te marco.`,
      ],
    },
    3: {
      asunto: `Re: Cotización S${c.folio} — ¿la dejamos para más adelante?`,
      parrafos: [
        `${hola}`,
        `No quiero seguir llenándote el correo, así que este es mi último mensaje sobre la cotización <strong>S${c.folio}</strong>.`,
        `Si el curso quedó para después, no hay ningún problema: guardo tu expediente y cuando estés listo me escribes y lo retomamos desde donde lo dejamos.`,
        `Y si ya no va, también está bien — solo dímelo para dejar de insistir. Gracias por haber considerado a VITA RESCUE.`,
      ],
    },
  };

  const { asunto, parrafos } = cuerpos[p.paso];
  const html = `<div style="max-width:540px;margin:0 auto;padding:24px 16px;font-family:Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;">
${parrafos.map((t) => `<p>${t}</p>`).join("\n")}
<p style="margin-top:24px;">TUM I. Rodrigo Mata Santillana<br />
<span style="color:#777;font-size:13px;">Director VITA RESCUE · "Aprender, Aplicar, Salvar"</span></p>
</div>`;
  const texto = parrafos.map((t) => t.replace(/<[^>]+>/g, "")).join("\n\n");
  return { asunto, html, texto };
}


/** Una cotización que salió por chat: el motor no la puede seguir por correo. */
export type PorWhatsApp = {
  folio: number;
  quien: string;
  telefono: string | null;
  total: number | null;
  dias: number;
  mensaje: string;
  /** Link que abre el chat con el mensaje ya escrito. */
  link: string | null;
};

/**
 * Cotizaciones enviadas por WhatsApp o Instagram que llevan días sin respuesta.
 * El motor no les escribe —no hay correo— así que le prepara a Roy el mensaje
 * ya redactado para que solo lo copie y lo pegue en el chat.
 */
export function porWhatsApp(datos: {
  cotizaciones: CotizacionSeg[];
  correos: CorreoSeg[];
  solicitudes: SolicitudSeg[];
  minimoDias?: number;
}): PorWhatsApp[] {
  const { cotizaciones, correos, solicitudes, minimoDias = 3 } = datos;
  const solDe = new Map(solicitudes.map((s) => [s.id, s]));
  const contestaron = new Set(correos.filter((c) => c.direction === "in").map((c) => c.folio));
  const conCorreo = new Set(
    correos.filter((c) => c.direction === "out" && c.to_email).map((c) => c.cotizacion_id)
  );

  const salida: PorWhatsApp[] = [];
  for (const cot of cotizaciones) {
    if (cot.estado === "borrador") continue;
    if (conCorreo.has(cot.id)) continue;        // esa sí la sigue el motor
    if (contestaron.has(cot.folio)) continue;
    const sol = cot.quote_request_id ? solDe.get(cot.quote_request_id) : null;
    if (sol?.etapa === "ganada" || sol?.etapa === "perdida") continue;

    if (telefonoInterno(sol?.telefono)) continue;   // cotización de prueba tuya
    const quien = cot.dirigida || sol?.organizacion || sol?.nombre || "Sin nombre";
    const personas = cot.num_personas ? `${cot.num_personas} personas` : "tu grupo";
    const mensaje =
      `Hola, le escribo de VITA RESCUE. Le mandamos la cotización S${cot.folio} ` +
      `del curso de primeros auxilios para ${personas}. ¿Pudo revisarla? ` +
      `Si tiene alguna duda o necesita ajustar la fecha o el presupuesto, con gusto lo vemos.`;
    const digitos = String(sol?.telefono ?? "").replace(/\D/g, "");
    salida.push({
      folio: cot.folio,
      quien,
      telefono: sol?.telefono ?? null,
      total: cot.total,
      dias: minimoDias,
      mensaje,
      link: digitos.length >= 10 ? `https://wa.me/${digitos.length === 10 ? "52" + digitos : digitos}?text=${encodeURIComponent(mensaje)}` : null,
    });
  }
  return salida;
}
