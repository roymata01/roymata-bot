// ============================================================
// FLUJO QUIERO — el embudo de venta del Método HÉROE
// (dictado por Roy el 14-oct-2026)
//
// Video en IG → comentan "QUIERO" → DM → video → seguimiento →
// compra, o rescate del dato (clase gratis) si no pueden.
//
// La ESTRUCTURA (fases, ramas, orden) vive aquí en código.
// Los TEXTOS y NOTAS los edita Roy en /flujo y se guardan como
// overrides en la tabla bot_flujos (fila id='quiero').
// Cuando el bot se reconecte a este flujo, leerá los textos de
// ahí — lo que Roy edita ES lo que el bot dirá.
// ============================================================

export type NodoTipo = "disparador" | "bot" | "accion" | "fin";

export type NodoFlujo = {
  id: string;
  tipo: NodoTipo;
  titulo: string;
  /** Lo que dice el bot. "|||" separa burbujas (igual que en generate-reply). */
  texto: string;
  /** Regla de tiempo o condición, en lenguaje de Roy. */
  nota?: string;
};

export type RamaFlujo = {
  id: string;
  etiqueta: string; // lo que contestó la persona
  color: "verde" | "ambar" | "rojo" | "gris";
  nodos: NodoFlujo[];
  /** A dónde sigue esta rama cuando termina. */
  destino: string;
};

export type PasoFlujo =
  | { tipo: "nodo"; nodo: NodoFlujo }
  | { tipo: "decision"; id: string; pregunta: string; ramas: RamaFlujo[] };

export type FaseFlujo = {
  id: string;
  nombre: string;
  desc: string;
  pasos: PasoFlujo[];
};

// Overrides que guarda Roy: { [nodoId]: { texto?, nota? } }
export type OverridesFlujo = Record<string, { texto?: string; nota?: string }>;

export const FLUJO_QUIERO: FaseFlujo[] = [
  {
    id: "disparador",
    nombre: "El disparador",
    desc: "Roy sube el video a Instagram y avisa: comenta QUIERO y te mando la mini clase.",
    pasos: [
      {
        tipo: "nodo",
        nodo: {
          id: "comentario",
          tipo: "disparador",
          titulo: "Comentan QUIERO en el video",
          texto: "el bot detecta la palabra quiero en los comentarios del video (mayusculas o minusculas, da igual) y abre un mensaje directo con esa persona",
          nota: "solo en el video de la campaña, no en todos los posts",
        },
      },
    ],
  },
  {
    id: "primer-dm",
    nombre: "Primer mensaje directo",
    desc: "El bot abre la plática al momento. Sin vender, sin precio: solo ofrecer el video.",
    pasos: [
      {
        tipo: "nodo",
        nodo: {
          id: "dm-inicial",
          tipo: "bot",
          titulo: "El DM de arranque",
          texto: "oye! vi que comentaste quiero en mi video ||| quieres que te pase el video con la mini clase que grabe para ti?",
          nota: "se manda al momento del comentario. va en UN solo DM (dos renglones): meta no deja mandar mas mensajes hasta que la persona conteste",
        },
      },
      {
        tipo: "nodo",
        nodo: {
          id: "reply-publico",
          tipo: "bot",
          titulo: "Respuesta pública al comentario (una al azar)",
          texto:
            "listo {nombre}, ya te lo mande por mensaje 📩 ||| ya te escribi por dm {nombre}, checa tus mensajes ||| te lo acabo de mandar al chat {nombre} 🙌 ||| revisa tus mensajes {nombre}, ya te lo envie ||| ya lo tienes en tus dm {nombre} 👀 ||| listo {nombre}! checa tus mensajes ||| {nombre} te lo mande por privado, no se te vaya a solicitudes ||| ya quedo {nombre}, te escribi por dm 💪 ||| checa el chat {nombre}, ahi te lo deje ||| enviado {nombre} 📩 revisa tus mensajes",
          nota: "justo despues de mandar el dm, el bot contesta el comentario en publico con UNA de estas (al azar). {nombre} se cambia por el nombre real sacado del @usuario; si no se le encuentra nombre, sale limpio sin nombre. cada burbuja es una version, agrega o quita las que quieras",
        },
      },
      {
        tipo: "decision",
        id: "d-contesta",
        pregunta: "que contesta?",
        ramas: [
          {
            id: "si-video",
            etiqueta: "dice que si",
            color: "verde",
            nodos: [
              {
                id: "mandar-video",
                tipo: "bot",
                titulo: "Le manda el video",
                texto: "va, aqui te va ||| cursos.vitarescue.com.mx/heroe ||| es una mini clase que grabe, ahi te explico todo",
                nota: "el video ES la respuesta: ahi viene toda la info y el precio (jamas por chat). si contesta solo 'va gracias', el bot SE CALLA — nada de querer la ultima palabra",
              },
            ],
            destino: "sigue en Seguimiento del video",
          },
          {
            id: "no-contesta-1",
            etiqueta: "no contesta",
            color: "gris",
            nodos: [
              {
                id: "insistida-1",
                tipo: "bot",
                titulo: "Insistida en dos tiempos",
                texto: "Brendaaa ||| te paso el video? esta bueno de verdad",
                nota: "el grito del nombre a las 5 horas, la segunda linea 2 horas despues. si en 24h no contesta, se deja y se etiqueta como frio",
              },
            ],
            destino: "si contesta → le manda el video",
          },
          {
            id: "no-quiere",
            etiqueta: "dice que no",
            color: "rojo",
            nodos: [
              {
                id: "puerta-abierta",
                tipo: "bot",
                titulo: "Puerta abierta",
                texto: "va, no te preocupes ||| si un dia te interesa aqui ando",
                nota: "se respeta el no. nada de presionar a quien nunca pidio el video",
              },
            ],
            destino: "fin — contacto queda etiquetado",
          },
        ],
      },
    ],
  },
  {
    id: "seguimiento",
    nombre: "Seguimiento del video",
    desc: "Ya tiene el link. Ahora el bot da seguimiento como lo haría Roy: una pregunta a la vez.",
    pasos: [
      {
        tipo: "nodo",
        nodo: {
          id: "ya-lo-viste",
          tipo: "bot",
          titulo: "Primer seguimiento",
          texto: "ya pudiste ver el video?",
          nota: "lo manda el sistema SOLO, unas 5 horas despues de mandar el link (aunque la persona haya cerrado con un gracias). una sola pregunta, sin bombardear",
        },
      },
      {
        tipo: "nodo",
        nodo: {
          id: "que-te-parecio",
          tipo: "bot",
          titulo: "Si ya lo vio",
          texto: "que te parecio? ||| con que idea te quedas?",
          nota: "platica genuina sobre el video, no interrogatorio. una burbuja y espera respuesta",
        },
      },
      {
        tipo: "nodo",
        nodo: {
          id: "cierre",
          tipo: "bot",
          titulo: "La pregunta de cierre",
          texto: "te interesa el curso?",
          nota: "directa y sin rodeos, cuando la platica del video ya fluyo",
        },
      },
      {
        tipo: "decision",
        id: "d-interes",
        pregunta: "que contesta?",
        ramas: [
          {
            id: "lo-quiere",
            etiqueta: "si, lo quiere",
            color: "verde",
            nodos: [
              {
                id: "inscripcion",
                tipo: "bot",
                titulo: "Acompañar la inscripción",
                texto: "va! aqui te dejo tu acceso ||| cursos.vitarescue.com.mx/heroe/comprar ||| cualquier cosa con tu inscripcion me dices",
                nota: "el link de compra SOLO cuando ya dijo que lo quiere. si se traba o duda: recordarle la garantia de 7 dias",
              },
              {
                id: "felicitacion",
                tipo: "bot",
                titulo: "Cuando se detecta su compra",
                texto: "yaaa vi tu inscripcion {nombre}! bienvenido al metodo heroe 🙌 ||| checa tu correo, ahi esta tu acceso. empieza con el modulo 1 y cualquier duda aqui ando",
                nota: "la manda el sistema solo al detectar la compra (cruza el correo de la platica con los alumnos). desde ese momento se apaga TODA la presion con esa persona",
              },
            ],
            destino: "compra detectada → felicitación + fin de la presión",
          },
          {
            id: "objecion",
            etiqueta: "no puede (dinero, tiempo…)",
            color: "ambar",
            nodos: [
              {
                id: "entender",
                tipo: "bot",
                titulo: "Entender + un intento más",
                texto: "lo entiendo, no te preocupes ||| mira, el curso es a tu ritmo y te llevas los certificados y los manuales ||| y si en los primeros 7 dias sientes que no es para ti, te regreso tu dinero",
                nota: "UN solo intento mas. si cambia de opinion → link de compra. si sigue en no → clase gratis",
              },
            ],
            destino: "si sigue en no → Rescate del dato",
          },
          {
            id: "no-contesta-2",
            etiqueta: "no contesta",
            color: "gris",
            nodos: [
              {
                id: "insistida-2",
                tipo: "bot",
                titulo: "Última insistida",
                texto: "oye, si pudiste ver el video? jaja",
                nota: "una sola vez por persona. si de plano no contesta, pasa directo al Rescate del dato",
              },
            ],
            destino: "sin respuesta → Rescate del dato",
          },
        ],
      },
    ],
  },
  {
    id: "rescate",
    nombre: "Rescate del dato",
    desc: "No compró, pero no se va con las manos vacías: se vuelve interesado de VITA.",
    pasos: [
      {
        tipo: "nodo",
        nodo: {
          id: "clase-gratis",
          tipo: "bot",
          titulo: "La clase gratis",
          texto: "va, no hay problema ||| mira, el proximo mes voy a dar una clase gratis en vivo ||| te late que te avise? pasame tu nombre y tu correo y te mando la invitacion",
          nota: "tono de regalo, no de consolacion. aqui es donde se rescata el dato",
        },
      },
      {
        tipo: "nodo",
        nodo: {
          id: "guardar-dato",
          tipo: "accion",
          titulo: "Guardar en la base de interesados",
          texto: "el bot guarda nombre + correo en la lista de interesados de vita y etiqueta el contacto para la invitacion de la clase gratis",
          nota: "de esta lista salen las invitaciones de la proxima clase gratis en vivo",
        },
      },
      {
        tipo: "nodo",
        nodo: {
          id: "despedida",
          tipo: "fin",
          titulo: "Despedida",
          texto: "listo, te aviso ||| cualquier cosa aqui ando",
          nota: "se cierra con buena vibra y AQUI TERMINA: si la persona contesta 'gracias' o similar, el bot ya no dice nada",
        },
      },
    ],
  },
];

// Las reglas que aplican en TODO el flujo (ya viven en la
// personalización del bot; aquí solo se recuerdan).
export const REGLAS_DE_ORO = [
  "el precio JAMAS se da por chat — el video es quien lo dice",
  "cero preguntas sociales (nada de como estas, a que te dedicas)",
  "minusculas, sin acentos, typos de vez en cuando — como escribe roy",
  "mensajes de 1 linea, maximo 2",
  "solo escribe entre 9am y 10pm",
  "si sacan otro tema: un mensaje y de regreso al flujo",
  "una insistida a la vez, nunca dos preguntas juntas",
  "saber ACABAR: si la persona cierra con un gracias/ok, el bot no contesta — jamas busca la ultima palabra",
];

/** Aplica los textos editados por Roy encima de los default. */
export function aplicarOverrides(fases: FaseFlujo[], ov: OverridesFlujo): FaseFlujo[] {
  const parcha = (n: NodoFlujo): NodoFlujo => ({
    ...n,
    texto: ov[n.id]?.texto ?? n.texto,
    nota: ov[n.id]?.nota ?? n.nota,
  });
  return fases.map((f) => ({
    ...f,
    pasos: f.pasos.map((p) =>
      p.tipo === "nodo"
        ? { ...p, nodo: parcha(p.nodo) }
        : { ...p, ramas: p.ramas.map((r) => ({ ...r, nodos: r.nodos.map(parcha) })) }
    ),
  }));
}
