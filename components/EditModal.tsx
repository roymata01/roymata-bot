"use client";

export function EditModal({
  title,
  onClose,
  onSave,
  saving,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#141C2F] p-6 shadow-[0_0_60px_-15px_rgba(249,115,22,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold">{title}</h3>
        <div className="flex flex-col gap-3">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-1.5 text-sm font-semibold hover:bg-white/5">
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-lg border border-orange-500/60 bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
