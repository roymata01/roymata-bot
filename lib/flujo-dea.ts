// ============================================================
// FLUJO DEA — el embudo de registro de la MASTERCLASS de diciembre
// (pedido de Roy el 8-nov-2026)
//
// Video en IG/FB → comentan "DEA" → DM con el link de registro →
// seguimiento hasta que se registren. Aquí NO se vende nada: la
// masterclass es GRATIS (domingo 13-dic, 7pm CDMX) y el único
// objetivo es que la persona quede registrada.
//
// La ESTRUCTURA vive aquí en código; los TEXTOS los edita Roy en
// /flujo (pestaña DEA) y se guardan en bot_flujos (fila id='dea').
// ============================================================

import type { FaseFlujo } from "@/lib/flujo-quiero";

export const LINK_MASTERCLASS = "cursos.vitarescue.com.mx/masterclass";

export const FLUJO_DEA: FaseFlujo[] = [
  {
    id: "disparador",
    nombre: "El disparador",
    desc: "Roy sube el video y avisa: comenta DEA y te mando el registro de la clase gratis de diciembre.",
    pasos: [
      {
        tipo: "nodo",
        nodo: {
          id: "comentario",
          tipo: "disparador",
          titulo: "Comentan DEA en el video",
          texto:
            "el bot detecta la palabra dea en los comentarios del video (mayusculas o minusculas, da igual) y le manda el registro por mensaje directo",
          nota: "funciona en instagram y facebook. en tiktok no se puede automatizar (tiktok no deja mandar dms por api) — ahi el video debe decir 'link en mi perfil'",
        },
      },
    ],
  },
  {
    id: "primer-dm",
    nombre: "Primer mensaje directo",
    desc: "Como ya pidieron el registro al comentar, el link va de una vez — sin preguntas antes.",
    pasos: [
      {
        tipo: "nodo",
        nodo: {
          id: "dm-inicial",
          tipo: "bot",
          titulo: "El DM con el registro",
          texto:
            "holaa {nombre}! vi tu DEA en el video 🫀 ||| aqui esta tu registro para la masterclass gratis de diciembre ||| cursos.vitarescue.com.mx/masterclass ||| es en vivo el domingo 13 de diciembre a las 7pm. registrate y tu lugar queda apartado",
          nota: "se manda al momento del comentario, en UN solo dm (los renglones van juntos): meta no deja mandar mas hasta que la persona conteste",
        },
      },
      {
        tipo: "nodo",
        nodo: {
          id: "reply-publico",
          tipo: "bot",
          titulo: "Respuesta pública al comentario (una al azar)",
          texto:
            "listo {nombre}, te mande el registro por dm 📩 ||| ya te escribi por dm {nombre} 🙌 ||| checa tus mensajes {nombre}, ahi esta tu registro ||| te lo acabo de mandar al chat {nombre} 🫀 ||| ya lo tienes en tus dm {nombre}, no se te vaya a solicitudes ||| enviado {nombre} 📩 checa tus mensajes",
          nota: "solo en instagram (en facebook el permiso de comentar en publico pide app review). {nombre} sale del @usuario; si no se le encuentra nombre, va limpio. cada burbuja es una version al azar",
        },
      },
      {
        tipo: "decision",
        id: "d-contesta",
        pregunta: "que contesta?",
        ramas: [
          {
            id: "ya-se-registro",
            etiqueta: "ya se registró",
            color: "verde",
            nodos: [
              {
                id: "confirmar",
                tipo: "bot",
                titulo: "Confirmar y cerrar",
                texto:
                  "esoo {nombre} 🙌 ||| agendalo: domingo 13 de diciembre, 7pm. el link de la clase te llega a tu correo",
                nota: "si despues contesta 'gracias' o 'va', el bot SE CALLA — nada de querer la ultima palabra",
              },
            ],
            destino: "fin — queda registrado",
          },
          {
            id: "tiene-dudas",
            etiqueta: "pregunta algo (costo, tema, hora…)",
            color: "ambar",
            nodos: [
              {
                id: "dudas",
                tipo: "bot",
                titulo: "Resolver la duda y regresar al registro",
                texto:
                  "es 100% gratis y en vivo ||| vamos a ver como salvar una vida en las fiestas: atragantamientos en la cena, quemaduras, infartos... lo que nadie te enseña ||| registrate aqui y quedas: cursos.vitarescue.com.mx/masterclass",
                nota: "una duda a la vez y SIEMPRE de regreso al registro. jamas inventar datos de la clase",
              },
            ],
            destino: "cuando se registre → confirmar y cerrar",
          },
          {
            id: "no-contesta-1",
            etiqueta: "no contesta",
            color: "gris",
            nodos: [
              {
                id: "insistida-dea",
                tipo: "bot",
                titulo: "Insistida en dos tiempos",
                texto: "{nombre}! ||| ya apartaste tu lugar? es gratis y se llena rapido",
                nota: "el grito del nombre a las ~5 horas, la segunda linea ~2 horas despues. una sola vez por persona",
              },
            ],
            destino: "si contesta → sigue la plática normal",
          },
        ],
      },
    ],
  },
  {
    id: "seguimiento",
    nombre: "Seguimiento del registro",
    desc: "Ya tiene el link. El bot solo confirma que haya quedado registrado — nada más.",
    pasos: [
      {
        tipo: "nodo",
        nodo: {
          id: "ya-quedaste",
          tipo: "bot",
          titulo: "Confirmar el registro",
          texto: "ya quedaste registrado {nombre}?",
          nota: "lo manda el sistema SOLO, unas horas despues del link. una sola pregunta, sin bombardear",
        },
      },
      {
        tipo: "nodo",
        nodo: {
          id: "recordatorio-lugares",
          tipo: "bot",
          titulo: "Recordatorio de presión: lugares limitados",
          texto: "oye, nada mas te recuerdo que los lugares son limitados eh jaja ||| registrate antes de que se llene: cursos.vitarescue.com.mx/masterclass",
          nota: "lo manda el sistema solo, al dia siguiente, SOLO si la persona sigue sin confirmar su registro. una sola vez por persona",
        },
      },
      {
        tipo: "decision",
        id: "d-registro",
        pregunta: "que contesta?",
        ramas: [
          {
            id: "si-quedo",
            etiqueta: "sí, ya quedó",
            color: "verde",
            nodos: [
              {
                id: "festejo",
                tipo: "bot",
                titulo: "Festejo y fin",
                texto: "esoo! nos vemos el 13 ||| llega 5 minutos antes, va a estar buenisima",
                nota: "aqui TERMINA la platica. si contesta gracias, el bot no dice nada",
              },
            ],
            destino: "fin — nos vemos el 13 de diciembre",
          },
          {
            id: "no-puede-ese-dia",
            etiqueta: "no puede ese día",
            color: "ambar",
            nodos: [
              {
                id: "repeticion",
                tipo: "bot",
                titulo: "La repetición de 48 horas",
                texto:
                  "no te preocupes, registrate igual ||| a todos los registrados les mando la repeticion y queda disponible 48 horas",
                nota: "UN solo intento. si aun asi no quiere, puerta abierta y fin",
              },
            ],
            destino: "si se registra → festejo",
          },
          {
            id: "no-interesa",
            etiqueta: "no le interesa",
            color: "rojo",
            nodos: [
              {
                id: "puerta-abierta-dea",
                tipo: "bot",
                titulo: "Puerta abierta",
                texto: "va, no hay problema ||| si cambias de opinion aqui esta: cursos.vitarescue.com.mx/masterclass ||| aqui ando",
                nota: "se respeta el no. cero presion: la clase es gratis, no hay nada que forzar",
              },
            ],
            destino: "fin — contacto queda etiquetado",
          },
        ],
      },
    ],
  },
];

// Reglas que aplican en TODO el flujo DEA (además de las reglas de oro
// generales del bot).
export const REGLAS_DEA = [
  "la masterclass es GRATIS — si preguntan precio, la respuesta es que no cuesta nada",
  "aqui NO se vende el metodo heroe ni ningun curso: solo el registro de la clase",
  "jamas inventar datos: domingo 13 de diciembre, 7pm hora cdmx, en vivo, con repeticion 48 horas",
  "el link es siempre cursos.vitarescue.com.mx/masterclass — ningun otro",
  "si la persona cierra con gracias/ok, el bot no contesta",
  "nada de platica social: un paso del embudo por respuesta",
];
