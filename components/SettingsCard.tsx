"use client";

import { PencilIcon } from "@/components/icons";

export function SettingsCard({
  icon,
  title,
  preview,
  active,
  onToggleActive,
  onEdit,
}: {
  icon: React.ReactNode;
  title: string;
  preview: string;
  active?: boolean;
  onToggleActive?: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-white/[0.04] text-[var(--text-2)]">
            {icon}
          </span>
          <h3 className="text-[13px] font-semibold leading-tight">{title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onToggleActive && (
            <button
              onClick={onToggleActive}
              aria-label={active ? "Desactivar" : "Activar"}
              className={`relative h-5 w-9 rounded-full transition ${active ? "bg-[#46b380]" : "bg-white/15"}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${active ? "left-[18px]" : "left-0.5"}`}
              />
            </button>
          )}
          <button
            onClick={onEdit}
            aria-label="Editar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-3)] transition hover:bg-white/[0.06] hover:text-[var(--text)]"
          >
            <PencilIcon size={14} />
          </button>
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-[var(--text-3)]">{preview || "Sin contenido todavía."}</p>
    </div>
  );
}
