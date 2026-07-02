"use client";

export function SettingsCard({
  icon,
  title,
  preview,
  active,
  onToggleActive,
  onEdit,
}: {
  icon: string;
  title: string;
  preview: string;
  active?: boolean;
  onToggleActive?: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-[#141C2F] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg">
            {icon}
          </span>
          <h3 className="font-semibold leading-tight">{title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onToggleActive && (
            <button
              onClick={onToggleActive}
              aria-label={active ? "Desactivar" : "Activar"}
              className={`relative h-6 w-11 rounded-full border transition ${
                active ? "border-emerald-500/60 bg-emerald-500/80" : "border-white/15 bg-white/10"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${active ? "left-5" : "left-0.5"}`}
              />
            </button>
          )}
          <button
            onClick={onEdit}
            aria-label="Editar"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 hover:bg-white/5"
          >
            ✎
          </button>
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-sm text-slate-400">{preview || "Sin contenido todavía."}</p>
    </div>
  );
}
