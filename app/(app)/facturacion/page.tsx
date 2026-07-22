"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Ticket, TicketStatus } from "@/types/database";

const STATUS_UI: Record<TicketStatus, { label: string; color: string }> = {
  PENDIENTE: { label: "Pendiente", color: "#f0b429" },
  FACTURADO: { label: "Facturado", color: "#46b380" },
  REVISION_MANUAL: { label: "Revisión manual", color: "#e8613c" },
  INCOMPLETO: { label: "Incompleto", color: "#e5484d" },
  VENCIDO: { label: "Vencido", color: "#62676f" },
};

export default function FacturacionPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [filtro, setFiltro] = useState<TicketStatus | "todos">("todos");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("tickets").select("*").order("created_at", { ascending: false });
    const lista = (data as Ticket[]) ?? [];
    setTickets(lista);
    setLoading(false);
    // miniaturas con URL firmada (bucket privado)
    const rutas = lista.map((t) => t.foto_path);
    if (rutas.length) {
      const { data: firmadas } = await supabase.storage.from("tickets").createSignedUrls(rutas, 3600);
      const mapa: Record<string, string> = {};
      (firmadas ?? []).forEach((f) => {
        if (f.signedUrl && f.path) mapa[f.path] = f.signedUrl;
      });
      setFotos(mapa);
    }
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la pantalla
    load();
  }, [load]);

  // El iPhone sube HEIC, que la visión de la IA no lee: se convierte a JPEG en
  // el navegador (Safari sí decodifica HEIC) y de paso se reduce el peso.
  async function aJpeg(file: File): Promise<Blob> {
    try {
      const bmp = await createImageBitmap(file);
      const MAX = 2200;
      const escala = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * escala);
      canvas.height = Math.round(bmp.height * escala);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      if (!blob) throw new Error("conversión vacía");
      return blob;
    } catch {
      return file; // si este navegador no puede, sube el original
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      for (const file of Array.from(files)) {
        const jpeg = await aJpeg(file);
        const ahora = new Date();
        const path = `${ahora.getFullYear()}/${String(ahora.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.jpg`;
        const { error: upError } = await supabase.storage.from("tickets").upload(path, jpeg, { contentType: "image/jpeg" });
        if (upError) throw upError;
        const { data: fila, error: insError } = await supabase
          .from("tickets")
          .insert({ foto_path: path })
          .select()
          .single();
        if (insError) throw insError;
        // dispara el OCR (corre en segundo plano en el servidor)
        fetch("/api/tickets/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: fila.id }),
        });
      }
      await load();
      // recarga cuando el OCR ya haya llenado los datos
      setTimeout(load, 12_000);
      setTimeout(load, 25_000);
    } catch (e) {
      alert("Error subiendo el ticket: " + (e as Error).message);
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const visibles = tickets.filter((t) => filtro === "todos" || t.status === filtro);
  const conteo = (s: TicketStatus) => tickets.filter((t) => t.status === s).length;

  if (loading) return <div className="p-6 text-[13px] text-[var(--text-3)]">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="page-title">Facturación</h2>
            <p className="page-sub">
              Sube la foto del ticket y la IA extrae los datos. La corrida diaria de las 10am genera las
              facturas en el portal de cada tienda.
            </p>
          </div>
          <button onClick={() => inputRef.current?.click()} disabled={subiendo} className="btn btn-primary">
            {subiendo ? "Subiendo..." : "📷 Subir ticket"}
          </button>
          {/* sin "capture": el teléfono ofrece elegir de la fototeca O tomar foto */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFiltro("todos")} className={`chip ${filtro === "todos" ? "!border-[var(--accent)]/40 !text-[var(--text-1)]" : ""}`}>
            Todos ({tickets.length})
          </button>
          {(Object.keys(STATUS_UI) as TicketStatus[]).map((s) => (
            <button key={s} onClick={() => setFiltro(s)} className={`chip ${filtro === s ? "!border-[var(--accent)]/40 !text-[var(--text-1)]" : ""}`}>
              {STATUS_UI[s].label} ({conteo(s)})
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {visibles.map((t) => (
            <div key={t.id} className="card flex gap-4 p-4">
              {fotos[t.foto_path] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={fotos[t.foto_path]} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={fotos[t.foto_path]} alt="ticket" className="h-20 w-16 rounded-md border border-[var(--border)] object-cover" />
                </a>
              ) : (
                <div className="h-20 w-16 shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)]" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[14px] font-semibold">{t.tienda ?? "Analizando..."}</p>
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium"
                    style={{ borderColor: `${STATUS_UI[t.status].color}40`, backgroundColor: `${STATUS_UI[t.status].color}1a`, color: STATUS_UI[t.status].color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_UI[t.status].color }} />
                    {STATUS_UI[t.status].label}
                  </span>
                </div>
                <p className="text-[13px] text-[var(--text-2)]">
                  {t.fecha_compra ?? "—"} · {t.monto != null ? `$${Number(t.monto).toFixed(2)}` : "—"}
                  {t.folio ? ` · folio ${t.folio}` : ""}
                </p>
                {t.fecha_limite && t.status === "PENDIENTE" && (
                  <p className="text-[11px] text-[var(--text-3)]">Facturar antes del {t.fecha_limite}</p>
                )}
                {t.notas && <p className="text-[12px] text-[var(--text-3)]">{t.notas}</p>}
                {t.status === "FACTURADO" && (
                  <p className="text-[12px]">
                    {t.factura_pdf_url && <a className="text-[var(--accent)] underline" href={t.factura_pdf_url} target="_blank" rel="noreferrer">PDF</a>}
                    {t.factura_xml_url && <> · <a className="text-[var(--accent)] underline" href={t.factura_xml_url} target="_blank" rel="noreferrer">XML</a></>}
                  </p>
                )}
              </div>
            </div>
          ))}
          {visibles.length === 0 && (
            <p className="text-[13px] text-[var(--text-3)]">
              Sin tickets por aquí. Dale a &quot;Subir ticket&quot; y toma la foto directo con tu cel.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
