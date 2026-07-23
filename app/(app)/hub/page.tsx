"use client";

import { useRouter } from "next/navigation";
import { MUNDOS } from "@/lib/mundos";
import { SignOutButton } from "@/components/SignOutButton";

// Launcher: al entrar al sistema, Roy elige a qué mundo se mete.
// La elección se guarda para que el menú muestre solo ese mundo.
export default function HubPage() {
  const router = useRouter();

  function entrar(id: string, home: string) {
    try {
      localStorage.setItem("mundo", id);
    } catch {}
    router.push(home);
  }

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <header className="flex h-14 shrink-0 items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-[12px] font-bold text-white">
            V
          </span>
          <span className="text-[14px] font-semibold tracking-wide text-[var(--text)]">VITA · Sistema</span>
        </div>
        <SignOutButton />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-5 pb-16">
        <div className="w-full max-w-md">
          <p className="mb-1 text-[15px] text-[var(--text-2)]">{saludo}, Roy</p>
          <h1 className="mb-6 text-2xl font-bold text-[var(--text)]">¿A dónde entramos?</h1>

          <div className="flex flex-col gap-3">
            {MUNDOS.map((m) => (
              <button
                key={m.id}
                onClick={() => entrar(m.id, m.home)}
                className="card flex items-center gap-4 p-5 text-left transition hover:border-[var(--border-strong)] active:scale-[0.99]"
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
                  style={{ backgroundColor: m.color }}
                >
                  {m.nombre[0]}
                </span>
                <span className="flex flex-col">
                  <span className="text-[16px] font-semibold text-[var(--text)]">{m.nombre}</span>
                  <span className="text-[12px] text-[var(--text-3)]">{m.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
