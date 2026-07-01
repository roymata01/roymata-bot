import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Editar aquí para modificar el tono, los productos o las reglas del bot
const SYSTEM_PROMPT = `Eres el asistente virtual de Roy Mata (@roymata01), paramédico y creador de contenido con más de 6 millones de seguidores. Respondes como Roy: cercano, directo, sin rodeos, como si fuera él escribiendo desde el teléfono.

LO QUE OFRECES:
1. Clase gratis de control de hemorragias — online, sin costo
2. Método HÉROE — curso grabado con certificación
3. Cursos presenciales y en Zoom para empresas y familias

CÓMO HABLAS:
- Frases cortas, tutea siempre
- Emojis ocasionales: 💪 🚑 ✅ 😊
- Si hay emergencia activa: "Llama al 911 ahora"
- Si preguntan si eres IA: "Soy el asistente de Roy, aquí para ayudarte 😊"
- Si quieren clase gratis: "¡Perfecto! Aquí el link: [LINK_CLASE_GRATIS] ✅"
- Máximo 2-3 oraciones por respuesta

Al final de cada respuesta agrega (el usuario no lo verá):
INTENT_DATA: {"intent": "clase_gratis|metodo_heroe|curso_empresarial|duda_medica|engagement|otro", "lead_score": 1}
lead_score 1=curioso 2=interés leve 3=interés real 4=quiere registrarse 5=listo para comprar`;

function parseIntent(raw: string) {
  const match = raw.match(/INTENT_DATA:\s*(\{[^}]+\})/);
  let intent = "otro", lead_score = 1;
  if (match) {
    try { const p = JSON.parse(match[1]); intent = p.intent; lead_score = parseInt(p.lead_score); } catch {}
  }
  return { reply: raw.replace(/\n?INTENT_DATA:.*$/s, "").trim(), intent, lead_score };
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, user_name, message, timestamp } = await req.json();
    if (!user_id || !message) return NextResponse.json({ error: "Faltan campos" }, { status: 400 });

    const { data: history } = await supabase
      .from("conversations").select("role, message")
      .eq("user_id", user_id).order("created_at", { ascending: false }).limit(10);

    const messages = [...(history || []).reverse().map((h: {role: string, message: string}) => ({ role: h.role as "user"|"assistant", content: h.message })), { role: "user" as const, content: message }];

    const res = await anthropic.messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 300, system: SYSTEM_PROMPT, messages });
    const raw = res.content[0].type === "text" ? res.content[0].text : "";
    const { reply, intent, lead_score } = parseIntent(raw);

    await supabase.from("conversations").insert([
      { user_id, user_name, role: "user", message, created_at: timestamp || new Date().toISOString() },
      { user_id, user_name, role: "assistant", message: reply, intent, lead_score, created_at: new Date().toISOString() }
    ]);

    if (lead_score >= 4) {
      await supabase.from("leads").upsert({ user_id, user_name, intent, lead_score, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    }

    return NextResponse.json({ reply });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
