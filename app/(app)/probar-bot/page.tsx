"use client";

import { useState } from "react";

type HistoryItem = { role: "user" | "assistant"; content: string };
type DisplayItem =
  | { kind: "user"; content: string }
  | { kind: "ai"; content: string }
  | { kind: "note"; content: string };

export default function ProbarBotPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [display, setDisplay] = useState<DisplayItem[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setError(null);
    setDraft("");
    setDisplay((prev) => [...prev, { kind: "user", content: message }]);

    try {
      const res = await fetch("/api/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, message }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Algo falló");
        return;
      }

      if (body.type === "escalation") {
        const reason = body.keyword ? `palabra clave: "${body.keyword}"` : "la IA detectó una posible emergencia real";
        setDisplay((prev) => [
          ...prev,
          { kind: "note", content: `⚠️ Esto activaría escalación a humano (${reason}) — la IA no respondería, se marcaría "Por atender".` },
        ]);
      } else if (body.type === "irrelevant") {
        setDisplay((prev) => [
          ...prev,
          { kind: "note", content: "🔇 La IA no respondería a este mensaje — el clasificador lo detectó como personal/no relacionado con tus servicios." },
        ]);
      } else if (body.type === "reply") {
        setDisplay((prev) => [...prev, { kind: "ai", content: body.reply }]);
        setHistory((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: body.reply }]);
      }
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setHistory([]);
    setDisplay([]);
    setError(null);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="text-xl font-bold">Probar el bot</h2>
          <p className="text-sm text-slate-400">
            Escríbele como si fueras un cliente. Usa el mismo tono, base de conocimiento y reglas que el bot real —
            no se guarda en tu bandeja ni se manda a ningún canal.
          </p>
        </div>
        <button
          onClick={reset}
          className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/5"
        >
          Reiniciar conversación
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-2 overflow-y-auto p-6">
        {display.length === 0 && (
          <p className="text-sm text-slate-500">Escribe algo abajo para empezar, por ejemplo &quot;cuánto cuesta el curso de RCP&quot;.</p>
        )}
        {display.map((item, i) =>
          item.kind === "note" ? (
            <div key={i} className="self-center rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-center text-xs text-orange-300">
              {item.content}
            </div>
          ) : (
            <div
              key={i}
              className={`flex max-w-[75%] flex-col rounded-2xl px-3 py-2 ${
                item.kind === "user"
                  ? "self-start bg-[#141C2F] border border-white/10"
                  : "self-end bg-emerald-500/15 border border-emerald-500/40"
              }`}
            >
              {item.kind === "ai" && <span className="mb-0.5 text-[10px] font-bold uppercase text-slate-500">IA</span>}
              <p className="whitespace-pre-wrap text-sm">{item.content}</p>
            </div>
          )
        )}
        {sending && <p className="self-end text-xs text-slate-500">Escribiendo...</p>}
        {error && <p className="self-center text-sm text-red-400">{error}</p>}
      </div>

      <form onSubmit={handleSend} className="mx-auto flex w-full max-w-2xl gap-2 border-t border-white/10 p-4">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe como si fueras un cliente..."
          className="flex-1 rounded-lg border border-white/10 bg-[#141C2F] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-400"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="rounded-lg border border-orange-500/60 bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
