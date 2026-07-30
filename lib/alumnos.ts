// Validación de los datos que el alumno manda para su certificado.
// Se usa igual en el formulario (cliente) y en la ruta API (servidor).

export const CURP_RE = /^[A-Z]{4}\d{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;
// Personas físicas (13) y morales (12)
export const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;

export type DatosAlumno = {
  nombre_certificado: string;
  curp: string;
  rfc: string;
  ocupacion: string;
  curso?: string;
};

// Devuelve un mensaje por campo inválido; objeto vacío = todo bien.
export function validarAlumno(d: DatosAlumno): Partial<Record<keyof DatosAlumno, string>> {
  const errores: Partial<Record<keyof DatosAlumno, string>> = {};
  const nombre = d.nombre_certificado.trim();
  const curp = d.curp.trim().toUpperCase();
  const rfc = d.rfc.trim().toUpperCase();

  if (nombre.length < 5 || !nombre.includes(" ")) {
    errores.nombre_certificado = "Escribe tu nombre completo (nombre y apellidos).";
  } else if (nombre.length > 120) {
    errores.nombre_certificado = "El nombre es demasiado largo.";
  }

  if (!curp) errores.curp = "La CURP es necesaria para emitir tu certificado.";
  else if (curp.length !== 18) errores.curp = "La CURP tiene 18 caracteres.";
  else if (!CURP_RE.test(curp)) errores.curp = "Revisa tu CURP, algún carácter no coincide.";

  if (!rfc) errores.rfc = "El RFC es necesario.";
  else if (!RFC_RE.test(rfc)) errores.rfc = "Revisa tu RFC (12 o 13 caracteres).";

  const ocupacion = d.ocupacion.trim();
  if (!ocupacion) errores.ocupacion = "Escribe tu ocupación.";
  else if (ocupacion.length > 80) errores.ocupacion = "La ocupación es demasiado larga.";

  return errores;
}
