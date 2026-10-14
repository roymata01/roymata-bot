"use client";

// Panel de TikTok (app VITA - ROY): conectar la cuenta de Roy vía Login Kit
// y publicar un video de prueba con la Content Posting API. Es también la
// pantalla que se graba para el video demo de la revisión de TikTok.

import { useCallback, useEffect, useState } from "react";

type Estado = {
  configurado: boolean;
  conectado: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  openId: string | null;
};

export default function TikTokPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/tiktok/estado").then((x) => x.json());
    setEstado(r);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    cargar();
    const q = new URLSearchParams(window.location.search);
    if (q.get("error")) setError(`La conexión falló: ${q.get("error")}`);
  }, [cargar]);

  async function publicar(modo: "borrador" | "directo") {
    setPublicando(true);
    setResultado(null);
    setError(null);
    try {
      const r = await fetch("/api/tiktok/publicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: "Video de prueba VITA RESCUE 🚑", modo }),
      });
      const data = await r.json();
      if (!r.ok) setError(data.error ?? "No se pudo publicar");
      else {
        const st = (data.estado as { status?: string } | null)?.status ?? "procesando";
        if (modo === "borrador") {
          setResultado(
            st === "SEND_TO_USER_INBOX" || st === "PUBLISH_COMPLETE"
              ? "Video enviado a tu bandeja de TikTok ✅ — abre la app: te llega la notificación para terminar de publicarlo"
              : `Video enviado a TikTok — estado: ${st}`
          );
        } else {
          setResultado(
            st === "PUBLISH_COMPLETE"
              ? "Video publicado en la cuenta (privado, solo tú lo ves) ✅"
              : `Video enviado a TikTok — estado: ${st}`
          );
        }
      }
    } catch (e) {
      setError(String(e));
    }
    setPublicando(false);
  }

  async function desconectar() {
    if (!confirm("¿Desconectar la cuenta de TikTok?")) return;
    await fetch("/api/tiktok/estado", { method: "DELETE" });
    await cargar();
  }

  if (!estado) return <div className="p-6 text-[13px] text-[var(--text-3)]">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <div>
          <h2 className="page-title">TikTok</h2>
          <p className="text-[13px] text-[var(--text-2)]">
            Conexión de la app <strong>VITA - ROY</strong> con la cuenta de TikTok para publicar videos
            desde el sistema.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-[#dc2626]/25 bg-[#dc2626]/5 px-3 py-2 text-[12px] text-[#b91c1c]">{error}</div>
        )}

        {!estado.configurado ? (
          <div className="card p-4 text-[13px] text-[var(--text-2)]">
            Faltan las llaves de TikTok en la configuración del servidor.
          </div>
        ) : !estado.conectado ? (
          <div className="card flex flex-col items-start gap-3 p-5">
            <p className="text-[13px] text-[var(--text-2)]">
              Todavía no hay ninguna cuenta conectada. Al conectar, TikTok te pedirá autorizar a VITA - ROY
              sobre tu cuenta.
            </p>
            <a href="/api/tiktok/login" className="btn btn-primary">
              Conectar mi TikTok
            </a>
          </div>
        ) : (
          <>
            <div className="card flex items-center gap-3 p-4">
              {estado.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatar externo de TikTok
                <img src={estado.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black text-[15px] font-bold text-white">T</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{estado.displayName ?? "Cuenta conectada"}</p>
                <p className="text-[12px] text-[var(--text-3)]">Conectado vía Login Kit</p>
              </div>
              <button onClick={desconectar} className="btn btn-ghost !px-2.5 !py-1 !text-xs">
                Desconectar
              </button>
            </div>

            <div className="card flex flex-col items-start gap-3 p-5">
              <h3 className="text-[13px] font-semibold">Video de prueba (Content Posting API)</h3>
              <p className="text-[13px] text-[var(--text-2)]">
                <strong>Mandar como borrador:</strong> el video llega a tu bandeja de TikTok y tú lo
                terminas de publicar desde la app — funciona ya con tu cuenta.
                <br />
                <strong>Publicar directo:</strong> se publica solo (privado). Mientras TikTok no audite la
                app, solo funciona en cuentas privadas — es el modo del video demo.
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => publicar("borrador")} disabled={publicando} className="btn btn-primary">
                  {publicando ? "Enviando..." : "Mandar como borrador"}
                </button>
                <button onClick={() => publicar("directo")} disabled={publicando} className="btn btn-ghost">
                  Publicar directo
                </button>
              </div>
              {resultado && (
                <p className="rounded-lg border border-[#46b380]/25 bg-[#46b380]/10 px-3 py-2 text-[12px] text-[#2e8a5f]">{resultado}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
