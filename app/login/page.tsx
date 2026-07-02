"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(
        error.message.includes("Signups not allowed")
          ? "Ese correo no tiene acceso al panel."
          : error.message
      );
      return;
    }

    setStatus("sent");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F1E8] px-4">
      <div className="w-full max-w-sm rounded-2xl border-2 border-black bg-white p-8 shadow-[4px_4px_0_0_#000]">
        <h1 className="text-2xl font-bold mb-1">VITA RESCUE INBOX</h1>
        <p className="text-sm text-neutral-600 mb-6">Entra con tu correo para ver la bandeja.</p>

        {status === "sent" ? (
          <p className="text-sm">
            Te mandamos un link de acceso a <strong>{email}</strong>. Ábrelo desde este mismo dispositivo.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border-2 border-black px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-400"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-lg border-2 border-black bg-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
            >
              {status === "sending" ? "Enviando..." : "Enviar link de acceso"}
            </button>
            {status === "error" && <p className="text-sm text-red-600">{errorMessage}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
