// Agrega el ref de rastreo (?r=...) a los links de registro dentro de un texto.
// Con esto, cada registro en la página queda ligado a la conversación/invitación
// de DM que lo generó — atribución real de conversiones del bot.
// Soporta el dominio propio y el viejo de Vercel (misma app en ambos).
const DOMINIOS = ["cursos.vitarescue.com.mx", "hemorragias-vita.vercel.app"];

export function conRef(texto: string, ref: string): string {
  const patron = new RegExp(`https://(?:${DOMINIOS.map((d) => d.replace(/\./g, "\\.")).join("|")})/?([^\\s]*)`, "g");
  return texto.replace(patron, (url) => {
    if (url.includes("r=")) return url;
    return url + (url.includes("?") ? "&" : "?") + "r=" + ref;
  });
}
