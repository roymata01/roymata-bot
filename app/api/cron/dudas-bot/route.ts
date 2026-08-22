import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnthropicClient } from "@/lib/anthropic";
import { Resend } from "resend";

export const maxDuration = 300;

// Revisor nocturno de dudas de alumnos (cursos.vitarescue.com.mx/ayuda).
// Analiza cada duda NUEVA con Claude usando los datos reales del alumno:
// - Si la solución es clara → contesta por CORREO (lenguaje sencillo, paso a
//   paso) y marca estado='resuelta_bot' con la respuesta guardada en notas.
// - Si no la entiende o requiere acción de Roy → estado='revision' con la razón.
// ?dry=1 = simulacro: analiza y devuelve lo que HARÍA, sin enviar ni tocar nada.
// Corre diario 04:00 UTC (10pm CDMX) — ninguna duda pasa >24h sin atenderse.

const CONTEXTO = `Eres el asistente de soporte del Instituto VITA (VITA RESCUE), respondiendo
dudas de alumnos por correo en nombre del equipo. Público: gente que muchas
veces NO domina la tecnología — habla claro, cálido, en español mexicano
sencillo, con pasos numerados cuando expliques un procedimiento. Tutea SIEMPRE
(nada de "usted"). Sé breve: si la solución cabe en 4 pasos, no escribas 8. Nada de
tecnicismos ("caché", "navegador incógnito", etc. solo si es indispensable y
explicado). Firma siempre como "Equipo VITA RESCUE".

DATOS DEL PROGRAMA (Primera Generación del Instituto VITA, ago-dic 2026):
- Portal de alumnos: cursos.vitarescue.com.mx/mis-clases — se entra con el
  CORREO CON EL QUE PAGARON y una contraseña que ellos crean.
- Para crear o recuperar contraseña: en la pantalla de iniciar sesión tocar
  "¿Olvidaste tu contraseña?", escribir su correo de compra, y les llega un
  correo con el botón para crear una nueva (revisar spam/promociones).
- 10 clases en vivo, sábados cada 15 días 6:00 pm CDMX. Ya pasaron: Clase 1
  Control de Hemorragias (1-ago) y Clase 2 RCP y uso del DEA (15-ago).
  Próxima: Clase 3 Atragantamiento (OVACE), sábado 29 de agosto 6:00 pm.
- CERTIFICADOS: la Clase 1 entrega DOS: la constancia VITA de Control de
  Hemorragias Y el certificado internacional Stop The Bleed (ese es EXCLUSIVO
  de la clase 1, porque es el programa del American College of Surgeons de
  control de hemorragias — "Detén el Sangrado"). Las demás clases entregan UNA
  constancia VITA por clase. La Clase 2 (RCP y DEA) ya tiene su constancia en
  el portal y también se envió por correo el 17 de agosto con el manual adjunto.
- En el portal cada clase tiene: temario, cápsulas de video (se desbloquean el
  día de cada clase), grabación (cuando Roy la sube), certificados y manual.
- Los certificados también llegan por correo; si no los ven: revisar
  spam/promociones y buscar remitente vitarescue.com.mx.
- El manual de cada clase se descarga en el portal, dentro de la clase.
- Acceso a las clases EN VIVO: a cada alumno le llega su link personal de Zoom
  por correo antes de la clase, y también aparece un botón "Unirse a mi clase"
  arriba de su portal el día de la clase. NO inventes otros canales.
- Pagos OXXO: el pago tarda en confirmarse (días hábiles); al confirmarse llega
  todo automático al correo.
- Ayuda adicional: pueden responder el correo o escribir en
  cursos.vitarescue.com.mx/ayuda.

CUÁNDO NO DEBES CONTESTAR (accion "revision"):
- Reembolsos, aclaraciones de pago/dinero, facturas.
- Correcciones de nombre en certificados o cambios de correo de la cuenta
  (requieren que Roy edite datos).
- El alumno dice que pagó pero NO aparece en los datos que te doy.
- Quejas serias, enojo fuerte o temas delicados.
- Cualquier duda que no entiendas o donde no estés seguro de la solución.

FORMATO DE SALIDA — responde SOLO este JSON:
{"accion":"responder","respuesta":"<texto plano del correo, con saltos de línea; sin asunto, sin 'Hola X' porque el sistema lo agrega>"}
o
{"accion":"revision","razon":"<1-2 líneas: por qué lo dejas para Roy>","respuesta":"<AUN ASÍ escribe tu mejor borrador del correo que Roy podría mandar — mismo formato que arriba. Si te falta un dato, déjalo entre corchetes, ej. [FOLIO CORRECTO]. Roy lo edita y decide si lo envía; NUNCA se manda solo>"}`;

// Llama a Claude y extrae el JSON de decisión; junta TODOS los bloques de
// texto (el modelo a veces antepone razonamiento) y reintenta una vez si la
// salida no fue JSON válido.
async function analizar(
  anthropic: ReturnType<typeof createAnthropicClient>,
  pregunta: string
): Promise<{ accion: string; respuesta?: string; razon?: string }> {
  const mensajes: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: pregunta }];
  for (let intento = 1; intento <= 2; intento++) {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2500,
      system: CONTEXTO,
      messages: mensajes,
    });
    const texto = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n");
    const ini = texto.indexOf("{");
    const fin = texto.lastIndexOf("}");
    if (ini !== -1 && fin > ini) {
      try {
        return JSON.parse(texto.slice(ini, fin + 1));
      } catch {
        // cae al reintento
      }
    }
    if (intento === 1) {
      mensajes.push({ role: "assistant", content: texto.slice(0, 1500) });
      mensajes.push({ role: "user", content: "Tu respuesta no fue el JSON pedido. Responde ÚNICAMENTE el objeto JSON del formato indicado, sin ningún texto adicional." });
    } else {
      throw new Error(`sin JSON tras 2 intentos; el modelo dijo: "${texto.slice(0, 150)}..."`);
    }
  }
  throw new Error("inalcanzable");
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const supabase = createAdminClient();
  const { data: dudas } = await supabase
    .from("support_requests")
    .select("*")
    .eq("estado", "nueva")
    .order("created_at")
    .limit(20);

  if (!dudas?.length) return NextResponse.json({ ok: true, dudas: 0 });

  const anthropic = createAnthropicClient();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const resultados: unknown[] = [];

  for (const d of dudas) {
    // Datos reales del alumno para que la respuesta no invente nada
    const email = (d.email || "").toLowerCase().trim();
    const [{ data: certs }, { data: portal }] = await Promise.all([
      supabase.from("certificates").select("folio, class_numero, full_name, status").ilike("email", email),
      supabase.from("portal_users").select("email").ilike("email", email).maybeSingle(),
    ]);
    const contextoAlumno = `DATOS REALES de este alumno (correo ${email}):
- Certificados en sistema: ${certs?.length ? certs.map((c) => `clase ${c.class_numero} folio ${c.folio} (correo ${c.status === "sent" ? "enviado" : "pendiente"})`).join(", ") : "NINGUNO con este correo"}
- Cuenta del portal (ya creó contraseña): ${portal ? "SÍ existe" : "NO existe todavía"}`;

    let decision: { accion: string; respuesta?: string; razon?: string };
    const pregunta = `DUDA de ${d.nombre} <${d.email}> (tipo: ${d.tipo}):\nAsunto: ${d.asunto}\nMensaje: ${d.mensaje}\n\n${contextoAlumno}`;
    try {
      decision = await analizar(anthropic, pregunta);
    } catch (e) {
      decision = { accion: "revision", razon: `El análisis automático falló: ${e instanceof Error ? e.message.slice(0, 200) : e}` };
    }

    const fecha = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" });

    if (decision.accion === "responder" && decision.respuesta) {
      if (!dry) {
        // PRIMERO se marca en la base y DESPUÉS se envía: si la marca falla
        // (p.ej. falta el SQL de estados), NO se manda nada y no hay riesgo de
        // correos duplicados en la siguiente corrida.
        const { error: marcaErr } = await supabase.from("support_requests").update({
          estado: "resuelta_bot",
          notas: `🤖 Contestada por el bot (${fecha}):\n${decision.respuesta}`,
        }).eq("id", d.id);
        if (marcaErr) {
          resultados.push({ duda: d.asunto, email: d.email, accion: "marca_fallo", error: marcaErr.message.slice(0, 120) });
          continue;
        }
        const nombrePila = (d.nombre || "").trim().split(/\s+/)[0] || "";
        const { error: mailErr } = await resend.emails.send({
          from: "Instituto VITA <contacto@vitarescue.com.mx>",
          to: d.email,
          subject: `Re: ${d.asunto} — Instituto VITA`,
          html: `<div style="max-width:540px;margin:0 auto;padding:24px 16px;font-family:Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;">
<p>Hola${nombrePila ? " " + nombrePila : ""},</p>
${decision.respuesta.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("")}
<p>Si esto no resuelve tu duda, responde este correo y con gusto te atendemos personalmente.</p>
<p style="margin-top:24px;">Equipo VITA RESCUE<br/><span style="color:#777;font-size:13px;">Instituto VITA · "Aprender, Aplicar, Salvar"</span></p>
</div>`,
        });
        if (mailErr) {
          await supabase.from("support_requests").update({
            estado: "revision",
            notas: `🤖 Intenté contestar pero el correo falló (${JSON.stringify(mailErr).slice(0, 100)}).`,
            borrador: decision.respuesta,
          }).eq("id", d.id);
          resultados.push({ duda: d.asunto, email: d.email, accion: "correo_fallo" });
          continue;
        }
      }
      resultados.push({ duda: d.asunto, email: d.email, accion: "respondida", respuesta: decision.respuesta });
    } else {
      if (!dry) {
        await supabase.from("support_requests").update({
          estado: "revision",
          notas: `🤖 Necesita tu revisión (${fecha}): ${decision.razon || "sin razón"}`,
          // El borrador se guarda aparte: el panel lo muestra con Editar/Enviar.
          borrador: decision.respuesta || null,
        }).eq("id", d.id);
      }
      resultados.push({ duda: d.asunto, email: d.email, accion: "revision", razon: decision.razon, borrador: !!decision.respuesta });
    }
  }

  return NextResponse.json({ ok: true, dry, dudas: dudas.length, resultados });
}
