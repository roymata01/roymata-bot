"use client";

import { useState } from "react";

export default function BotonAprobar({ slug, yaEnviada, tieneCorreo }: { slug: string; yaEnviada: boolean; tieneCorreo: boolean }) {
  const [estado, setEstado] = useState<"listo" | "enviando" | "enviada" | "error">(yaEnviada ? "enviada" : "listo");
  const [error, setError] = useState("");

  async function aprobar() {
    setEstado("enviando");
    setError("");
    try {
      const res = await fetch("/api/aprobar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setEstado("enviada");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setEstado("error");
    }
  }

  if (estado === "enviada") {
    return (
      <div style={{ marginTop: 14, background: "#dcfce7", border: "1px solid #86efac", color: "#166534", borderRadius: 12, padding: "14px 16px", fontWeight: 600 }}>
        ✅ Enviada al cliente — quedó registrada en tu panel como atendida.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <button
        onClick={aprobar}
        disabled={estado === "enviando" || !tieneCorreo}
        style={{
          width: "100%",
          background: tieneCorreo ? "#1a56db" : "#94a3b8",
          color: "#fff",
          fontWeight: 700,
          fontSize: 16,
          padding: "14px 16px",
          border: "none",
          borderRadius: 12,
          cursor: "pointer",
        }}
      >
        {!tieneCorreo ? "La solicitud no tiene correo — envíala desde el panel" : estado === "enviando" ? "Enviando…" : "✅ Aprobar y enviar al cliente"}
      </button>
      {error && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  );
}
