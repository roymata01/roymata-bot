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

    router.push("/hub");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] text-[13px] font-bold text-white">
            V
          </span>
          <div>
            <h1 className="text-[14px] font-semibold tracking-wide">VITA RESCUE</h1>
            <p className="text-xs text-[var(--text-3)]">Sistema</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            required
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input !py-2"
          />
          <button type="submit" disabled={status === "loading"} className="btn btn-primary !py-2">
            {status === "loading" ? "Entrando..." : "Entrar"}
          </button>
          {status === "error" && <p className="text-[13px] text-[#e5484d]">Contraseña incorrecta.</p>}
        </form>
      </div>
    </div>
  );
}
