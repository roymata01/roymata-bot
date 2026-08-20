// Simulacro del modo evento HYROX. No manda WhatsApp ni escribe en la base:
// solo corre la detección y arma la respuesta, e imprime lo que saldría.
//
// Uso: npx tsx --env-file=.env.local scripts/prueba-modo-hyrox.ts
import { detectarFamiliarHyrox } from "@/lib/hyrox/detectar-familiar";
import { generarRespuestaFamiliar } from "@/lib/hyrox/responder-familiar";
import { buscarAlertaHyrox } from "@/lib/hyrox/buscar-alerta";
import { classifyMessageForHistory } from "@/lib/ai/classify-message";
import { generateTestReply } from "@/lib/ai/generate-test-reply";

process.env.MODO_EVENTO_HYROX = "true"; // el simulacro corre siempre con la bandera encendida

const TELEFONO_SIN_ALERTA = "5215500000000"; // número que nunca recibió alerta
const sinAlerta = async () => null; // aísla la prueba de la base de HYROX

function separador(titulo: string) {
  console.log(`\n${"=".repeat(72)}\n${titulo}\n${"=".repeat(72)}`);
}

async function caso(
  titulo: string,
  texto: string,
  opciones: { salientes?: string[]; telefono?: string } = {}
) {
  separador(titulo);
  console.log(`ENTRA: "${texto}"`);
  const deteccion = await detectarFamiliarHyrox({
    texto,
    telefono: opciones.telefono ?? TELEFONO_SIN_ALERTA,
    salientes: opciones.salientes ?? [],
    buscarAlerta: sinAlerta,
  });
  console.log(`\nDETECCION: ${deteccion.esFamiliar ? "FAMILIAR HYROX" : "seguidor normal"}`);
  console.log(`MOTIVO: ${deteccion.motivo}`);
  console.log(`PUESTO: ${deteccion.puesto ?? "(no se pudo recuperar - no se inventa)"}`);

  if (deteccion.esFamiliar) {
    const previas = (opciones.salientes ?? []).filter((s) => s.includes("Servicio Médico del evento")).length;
    const { texto: respuesta, intencion } = await generarRespuestaFamiliar({
      texto,
      puesto: deteccion.puesto,
      esPrimeraRespuesta: previas === 0,
      respuestasPrevias: previas,
    });
    console.log(`INTENCION: ${intencion}`);
    console.log(`\nSALE:\n---\n${respuesta}\n---`);
    return;
  }

  // Camino normal del bot, igual que en produccion.
  const categoria = await classifyMessageForHistory([{ role: "user", content: texto }]);
  console.log(`CLASIFICADOR NORMAL: ${categoria}`);
  if (categoria === "personal") {
    console.log("\nSALE: (nada - los mensajes personales se quedan callados)");
    return;
  }
  if (categoria === "emergencia") {
    console.log("\nSALE: (nada - se escala a Roy)");
    return;
  }
  const respuesta = await generateTestReply([{ role: "user", content: texto }], null);
  console.log(`\nSALE (tono normal de Roy):\n---\n${respuesta}\n---`);
}

async function main() {
  await caso("(a) Familiar que recibio la alerta", "me llegó un mensaje de que mi hijo está en la clínica 1, ¿está bien?");

  await caso("(b) El mismo familiar insiste", "¿qué le pasó? ¿es grave?", {
    salientes: [
      "Este es un mensaje automático del Servicio Médico del evento.\n\nTu familiar está siendo atendido por nuestro personal médico.\n\nAcércate a Clínica 1 o pregúntale a cualquier miembro del staff del evento o en el Infopoint — ahí te pueden dar más información y guiarte.",
    ],
  });

  await caso("(c) Seguidor normal, con la bandera ENCENDIDA", "¿tienes cursos de primeros auxilios?");

  await caso("(d) El familiar insiste por tercera vez", "por favor solo dime si está grave, se lo suplico", {
    salientes: ["Este es un mensaje automático del Servicio Médico del evento.\n\nTu familiar está siendo atendido por nuestro personal médico.\n\nAcércate a Clínica 1 o pregúntale a cualquier miembro del staff del evento o en el Infopoint — ahí te pueden dar más información y guiarte.", "Por este medio no tenemos información sobre su estado.\n\nAcércate a Clínica 1 ... — Servicio Médico del evento (mensaje automático)"],
  });

  await caso("(e) El familiar pregunta por cursos DESPUES de estar en modo familiar", "oye y tú das cursos de primeros auxilios? me interesan", {
    salientes: ["Este es un mensaje automático del Servicio Médico del evento.\n\nTu familiar está siendo atendido por nuestro personal médico.\n\nAcércate a Clínica 1 o pregúntale a cualquier miembro del staff del evento o en el Infopoint — ahí te pueden dar más información y guiarte."],
  });

  separador("(extra) Consulta real a notificaciones_whatsapp del proyecto HYROX");
  const alerta = await buscarAlertaHyrox("5212228067240");
  console.log(
    alerta
      ? `Alerta encontrada -> puesto: ${alerta.puesto}, tipo: ${alerta.tipo}, enviada: ${alerta.enviadaEn}`
      : "Sin alerta reciente para ese numero (o faltan HYROX_SUPABASE_URL/KEY)"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
