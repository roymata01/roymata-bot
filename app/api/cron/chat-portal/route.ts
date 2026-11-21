import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient } from "@/lib/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cerebro del chat de ayuda del portal de alumnos (cursos.vitarescue.com.mx).
// El portal arma el contexto del alumno, define las herramientas y EJECUTA las
// acciones; aquí solo se hace la llamada al modelo, porque la clave de
// Anthropic vive en este proyecto. Un turno por llamada: el portal lleva el
// ciclo de herramientas y vuelve a llamar con los resultados.
//
// Modelo: CHAT_PORTAL_MODEL (por defecto claude-opus-5-5). Si el modelo
// principal declina por seguridad, el respaldo contesta en la misma llamada.

const MODELO = process.env.CHAT_PORTAL_MODEL || "claude-opus-5-5";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.system !== "string" || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Faltan system o messages" }, { status: 400 });
  }

  const anthropic = createAnthropicClient();
  try {
    const usaRespaldo = MODELO === "claude-opus-5-5";
    const resp = await anthropic.beta.messages.create({
      model: MODELO,
      max_tokens: 2000,
      // El contexto fijo (reglas + manual) se cachea; lo del alumno va después.
      system: [
        { type: "text", text: body.system, cache_control: { type: "ephemeral" } },
        ...(typeof body.contexto === "string" && body.contexto
          ? [{ type: "text" as const, text: body.contexto }]
          : []),
      ],
      messages: body.messages as Anthropic.Beta.BetaMessageParam[],
      tools: (Array.isArray(body.tools) ? body.tools : []) as Anthropic.Beta.BetaToolUnion[],
      // Chat en vivo: respuestas rápidas y cortas.
      output_config: { effort: "low" },
      ...(usaRespaldo
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: [{ model: "claude-opus-4-8" }] }
        : {}),
    });

    return NextResponse.json({
      stop_reason: resp.stop_reason,
      content: resp.content,
      usage: resp.usage,
      model: resp.model,
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "saturado" }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("chat-portal: error de la API", error.status, error.message);
      return NextResponse.json({ error: `api ${error.status}: ${error.message.slice(0, 200)}` }, { status: 502 });
    }
    console.error("chat-portal: error inesperado", error);
    return NextResponse.json({ error: "error interno" }, { status: 500 });
  }
}
