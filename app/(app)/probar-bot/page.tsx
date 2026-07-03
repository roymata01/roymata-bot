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
  const [customerName, setCustomerName] = useState("");
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
        body: JSON.stringify({ history, message, customerName: customerName.trim() || null }),
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
          { kind: "note", content: `Esto activaría escalación a humano (${reason}) — la IA no respondería, se marcaría "Por atender".` },
        ]);
      } else if (body.type === "irrelevant") {
        setDisplay((prev) => [
          ...prev,
          { kind: "note", content: "La IA no respondería a este mensaje — el clasificador lo detectó como personal/no relacionado con tus servicios." },
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
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-6 py-4">
        <div>
          <h2 className="page-title">Probar el bot</h2>
          <p className="page-sub">
            Escríbele como si fueras un cliente. Usa el mismo tono, base de conocimiento y reglas que el bot real —
            no se guarda en tu bandeja ni se manda a ningún canal.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Nombre del cliente (opcional)"
            className="input !w-48"
          />
          <button onClick={reset} className="btn btn-ghost">
            Reiniciar conversación
          </button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-2 overflow-y-auto p-6">
        {display.length === 0 && (
          <p className="text-[13px] text-[var(--text-3)]">Escribe algo abajo para empezar, por ejemplo &quot;cuánto cuesta el curso de RCP&quot;.</p>
        )}
        {display.map((item, i) =>
          item.kind === "note" ? (
            <div key={i} className="self-center rounded-md border border-[#f0b429]/25 bg-[#f0b429]/[0.07] px-3 py-2 text-center text-xs text-[#f0b429]">
              {item.content}
            </div>
          ) : (
            <div
              key={i}
              className={`flex max-w-[75%] flex-col rounded-xl px-3 py-2 ${
                item.kind === "user"
                  ? "self-start border border-[var(--border)] bg-[var(--surface-2)]"
                  : "self-end border border-[#46b380]/20 bg-[#46b380]/[0.08]"
              }`}
            >
              {item.kind === "ai" && (
                <span className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">IA</span>
              )}
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{item.content}</p>
            </div>
          )
        )}
        {sending && <p className="self-end text-[11px] text-[var(--text-3)]">Escribiendo...</p>}
        {error && <p className="self-center text-[13px] text-[#e5484d]">{error}</p>}
      </div>

      <form onSubmit={handleSend} className="mx-auto flex w-full max-w-2xl gap-2 border-t border-[var(--border)] p-4">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe como si fueras un cliente..."
          className="input !py-2"
        />
        <button type="submit" disabled={sending || !draft.trim()} className="btn btn-primary">
          Enviar
        </button>
      </form>
    </div>
  );
}
