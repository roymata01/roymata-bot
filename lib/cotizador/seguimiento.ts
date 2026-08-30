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

// Palabras que delatan a una institución. A una escuela se le saluda con su
// nombre completo; a una persona, solo por su nombre de pila.
// Ojo con los límites de palabra: sin \b, "S.A." matcheaba el "sa" de
// "ROSAURA" y la trataba como si fuera una empresa.
const ES_ORGANIZACION = /\b(colegio|escuela|universidad|instituto|preparatoria|secundaria|primaria|kinder|hospital|cl[ií]nica|empresa|corporativo|grupo|fundaci[oó]n|asociaci[oó]n|sindicato|ayuntamiento|secretar[ií]a|bomberos|cruz roja|s\.a\.|s\.c\.|sa de cv|imss|issste|dif|conalep|cbtis|cecyte|unam|ipn|udg|uaem)\b|protecci[oó]n civil|&/i;

/** Deja "colegio valencia & lancaster" como "Colegio Valencia & Lancaster". */
function capitalizar(texto: string) {
  const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "en", "a"]);
  return texto
    .split(/\s+/)
    .map((original, i) => {
      // Una palabra corta escrita toda en mayúsculas es una sigla (ICEL, UNAM,
      // IMSS): se deja como está, no se convierte en "Icel".
      if (original.length <= 5 && original === original.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(original)) {
        return original;
      }
      const palabra = original.toLowerCase();
      if (i > 0 && MINUSCULAS.has(palabra)) return palabra;
      if (palabra.length <= 1 || !/[a-záéíóúñ]/.test(palabra)) return palabra.toUpperCase();
      return palabra[0].toUpperCase() + palabra.slice(1);
    })
    .join(" ");
}

/**
 * Con quién se abre el correo. Nunca "Hola Sin nombre," ni un nombre partido
 * a la mitad: si es institución va completa, si es persona va su nombre de pila.
 */
function escaparHtml(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function saludo(dirigida: string | null) {
  // Varios "nombres" traen la dirección pegada: "Escuela en CDMX (Calzada de
  // los Misterios, ...)". Para saludar basta lo que va antes del paréntesis.
  const n = String(dirigida ?? "")
    .split(/[(,;]/)[0]
    .trim()
    .replace(/\s+/g, " ");
  // Siempre de usted. Y sin "Estimado/a": no sabemos el género de quien lee.
  if (!n || n.length < 2 || /^sin nombre$/i.test(n)) return "Buen día:";
  if (ES_ORGANIZACION.test(n)) return `Buen día, ${escaparHtml(capitalizar(n).slice(0, 60).trim())}:`;
  return `Buen día, ${escaparHtml(capitalizar(n.split(" ")[0]))}:`;
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
      asunto: `Cotización S${c.folio} — quedamos a sus órdenes`,
      parrafos: [
        `${hola}`,
        `Le escribo para confirmar que haya recibido correctamente la cotización <strong>S${c.folio}</strong>, del curso de primeros auxilios para ${personas}. En ocasiones estos correos llegan a la carpeta de no deseados y preferimos asegurarnos.`,
        `Con gusto le recuerdo lo que incluye: nosotros llegamos a sus instalaciones con <strong>todo el material para la capacitación práctica</strong> — maniquíes, simuladores y el equipo necesario para que cada participante practique. Al terminar, todos reciben su constancia con vigencia de un año <strong>el mismo día</strong>.`,
        `Si desea que le explique el temario con más detalle o que revisemos fechas disponibles, quedo por completo a sus órdenes.`,
      ],
    },
    2: {
      asunto: `Cotización S${c.folio} — con gusto la ajustamos a su medida`,
      parrafos: [
        `${hola}`,
        `Espero que se encuentre muy bien. Le escribo para ponerme a sus órdenes respecto a la cotización <strong>S${c.folio}</strong>.`,
        `Sé que organizar una capacitación para ${personas} implica cuadrar horarios y presupuesto, y en eso podemos ayudarle con mucho gusto: podemos <strong>dividir al grupo en dos turnos</strong> para no detener sus actividades, ajustar la fecha a lo que mejor les convenga, y si lo requieren emitimos <strong>DC-3 ante la STPS</strong> y factura.`,
        `Lo más valioso es lo que su equipo se lleva: saber exactamente qué hacer en los primeros minutos de una emergencia — controlar una hemorragia, usar un DEA, atender un atragantamiento. Son precisamente los minutos en los que se salva una vida.`,
        `Si lo prefiere, con mucho gusto le marco por teléfono para resolver cualquier duda. Solo indíqueme el horario que le acomode y yo me comunico con usted.`,
      ],
    },
    3: {
      asunto: `Cotización S${c.folio} — seguimos a sus órdenes`,
      parrafos: [
        `${hola}`,
        `Le escribo para reiterarle nuestro agradecimiento por haber considerado a VITA RESCUE para la capacitación de su equipo. Para nosotros es un gusto que nos hayan tomado en cuenta.`,
        `Entendemos que estos proyectos toman su tiempo y dependen de muchos factores. Su cotización <strong>S${c.folio}</strong> queda guardada en nuestro sistema, de modo que cuando llegue el momento oportuno basta con que me escriba y la retomamos justo donde la dejamos, sin necesidad de comenzar de nuevo.`,
        `Mientras tanto, quedamos a sus órdenes para cualquier duda sobre nuestros cursos: primeros auxilios básicos, RCP y uso del DEA, control de hemorragias (Stop The Bleed), primeros auxilios en niños y bebés, y nuestro programa especial para colegios.`,
        `Le deseo mucho éxito en sus proyectos y quedo atento a lo que necesite.`,
      ],
    },
  };

  const { asunto, parrafos } = cuerpos[p.paso];
  const botonWhatsApp = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border-left:4px solid #16A34A;border-radius:0 8px 8px 0;margin:20px 0;"><tr><td style="padding:14px 18px;">
<p style="margin:0 0 10px;color:#14532D;font-size:14px;font-weight:700;">📲 ¿Prefiere seguirlo por WhatsApp?</p>
<p style="margin:0 0 12px;color:#166534;font-size:13px;line-height:1.6;">Toque el botón y envíe el mensaje que ya viene escrito: su cotización le llega por ese medio y ahí mismo resolvemos cualquier duda.</p>
<a href="https://wa.me/5212224356482?text=${encodeURIComponent(`Hola! Quiero recibir mi cotización S${c.folio} por WhatsApp 📲`)}" style="display:inline-block;background:#16A34A;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:700;">Recibirla por WhatsApp</a>
</td></tr></table>`;

  const html = `<div style="max-width:540px;margin:0 auto;padding:24px 16px;font-family:Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;">
${parrafos.map((t) => `<p>${t}</p>`).join("\n")}
${botonWhatsApp}
<p style="margin-top:26px;">
<strong>TUM I. Rodrigo Mata Santillana</strong><br />
<span style="color:#555;font-size:13.5px;">Director · VITA RESCUE</span><br />
<span style="color:#777;font-size:13px;">Centro Capacitador en Primeros Auxilios</span><br />
<span style="color:#777;font-size:13px;">"Aprender, Aplicar, Salvar"</span></p>
</div>`;
  // La versión en texto plano se guarda en el hilo del CRM: hay que quitar las
  // etiquetas y también deshacer las entidades, o ahí se lee "&amp;".
  const texto = parrafos
    .map((t) =>
      t.replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
    )
    .join("\n\n");
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
