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
    <div className="min-h-screen flex items-center justify-center bg-[#F5F1E8] px-4">
      <div className="w-full max-w-sm rounded-2xl border-2 border-black bg-white p-8 shadow-[4px_4px_0_0_#000]">
        <h1 className="text-2xl font-bold mb-1">VITA RESCUE INBOX</h1>
        <p className="text-sm text-neutral-600 mb-6">Escribe la contraseña para entrar.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            required
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border-2 border-black px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-400"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-lg border-2 border-black bg-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
          >
            {status === "loading" ? "Entrando..." : "Entrar"}
          </button>
          {status === "error" && <p className="text-sm text-red-600">Contraseña incorrecta.</p>}
        </form>
      </div>
    </div>
  );
}
