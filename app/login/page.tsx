"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: "roymataparamedic@gmail.com",
      password,
    });

    if (error) {
      setStatus("error");
      return;
    }

    router.push("/inbox");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B1220] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-orange-500/30 bg-[#141C2F] p-8 shadow-[0_0_50px_-15px_rgba(249,115,22,0.4)]">
        <h1 className="text-2xl font-bold mb-1">VITA RESCUE INBOX</h1>
        <p className="text-sm text-slate-400 mb-6">Escribe la contraseña para entrar.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            required
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-400"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-lg border border-white/10 bg-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
          >
            {status === "loading" ? "Entrando..." : "Entrar"}
          </button>
          {status === "error" && <p className="text-sm text-red-400">Contraseña incorrecta.</p>}
        </form>
      </div>
    </div>
  );
}
