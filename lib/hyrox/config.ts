// Modo evento HYROX
// ------------------------------------------------------------------
// Durante el evento, la app VITA RESCUE manda alertas por WhatsApp a los
// familiares de las personas atendidas — desde ESTE MISMO número. Cuando el
// familiar contesta, el mensaje cae en este bot. Sin este modo, el bot le
// contestaría con el tono de Roy y le ofrecería cursos a alguien angustiado.
//
// Se prende y apaga con variables de entorno, sin tocar código.

/** Prende el modo evento. Apagado = el bot se comporta 100% normal. */
export function modoEventoHyroxActivo(): boolean {
  return process.env.MODO_EVENTO_HYROX === "true";
}

/**
 * Modo paranoico: con el evento encendido, CUALQUIER mensaje sin señales
 * claras de negocio se trata como familiar. Úsalo solo si durante el evento
 * se cuelan familiares que la detección normal no agarra.
 */
export function modoEventoEstricto(): boolean {
  return process.env.MODO_EVENTO_HYROX_ESTRICTO === "true";
}

/** Puestos médicos del evento, como los escribe la app de VITA RESCUE. */
export const PUESTOS_EVENTO = ["Clínica 1", "Clínica 2", "Carpa 1"] as const;

/** Firma que traen todas las alertas que salen de VITA RESCUE. */
export const FIRMA_ALERTA = "Servicio Médico HYROX";

/**
 * Firma que llevan TODAS nuestras respuestas en modo familiar. Sirve para dos
 * cosas: que el familiar sepa que habla con un sistema, y que el modo sea
 * pegajoso (si ya le contestamos así una vez, seguimos así toda la conversación).
 */
export const FIRMA_RESPUESTA = "Servicio Médico del evento";

/** Solo miran alertas recientes: una alerta vieja no debe activar el modo meses después. */
export const VENTANA_ALERTA_HORAS = 48;

/** Encuentra el nombre del puesto dentro de un texto (alerta o mensaje). */
export function detectarPuesto(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const normalizado = texto.toLowerCase().replace(/í/g, "i");
  for (const puesto of PUESTOS_EVENTO) {
    if (normalizado.includes(puesto.toLowerCase().replace(/í/g, "i"))) return puesto;
  }
  return null;
}

/** Últimos 10 dígitos: la app de VITA guarda "2228067240" y Meta manda "5212228067240". */
export function ultimos10(telefono: string | null | undefined): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  return digitos.length >= 10 ? digitos.slice(-10) : null;
}
