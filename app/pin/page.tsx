"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Pantalla del PIN de las secciones privadas ("El Bot" y "Personal").
// Solo la ven usuarios ya logueados (el proxy manda a /login antes).
function PantallaPin() {
  const router = useRouter();
  const params = useSearchParams();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  // a dónde regresar al atinarle (solo rutas internas, nada de URLs ajenas)
  const nextRaw = params.get("next") ?? "/hub";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/hub";

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim() || cargando) return;
    setCargando(true);
    setError("");
    try {
      const r = await fetch("/api/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "PIN incorrecto");
        setPin("");
        setCargando(false);
        return;
      }
      router.replace(next);
    } catch {
      setError("Algo falló, intenta de nuevo");
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-5">
      <form onSubmit={entrar} className="card flex w-full max-w-xs flex-col gap-4 p-6 text-center">
        <p className="text-4xl">🔒</p>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--text)]">Sección privada</h1>
          <p className="mt-1 text-[12.5px] text-[var(--text-3)]">
            Esta parte del sistema pide un PIN extra.
          </p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="• • • • • •"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-center text-[22px] tracking-[0.4em] text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
        {error && <p className="text-[12.5px] font-semibold text-[#e5484d]">{error}</p>}
        <button
          type="submit"
          disabled={cargando || !pin.trim()}
          className="rounded-xl bg-[var(--accent)] py-3 text-[14px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {cargando ? "Verificando…" : "Entrar"}
        </button>
        <button type="button" onClick={() => router.push("/hub")} className="text-[12px] text-[var(--text-3)] hover:text-[var(--text-2)]">
          ← Volver al inicio
        </button>
      </form>
    </div>
  );
}

export default function PinPage() {
  return (
    <Suspense>
      <PantallaPin />
    </Suspense>
  );
}
