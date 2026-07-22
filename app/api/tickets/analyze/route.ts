import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeTicket } from "@/lib/ai/analyze-ticket";

export const maxDuration = 60;

// último día del mes de la compra — regla general de los portales
function fechaLimite(fechaCompra: string): string {
  const [y, m] = fechaCompra.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0));
  return ultimo.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  // acepta la sesión del panel o la llave del proceso automatizado
  const auth = req.headers.get("authorization");
  const conLlave = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!conLlave) {
    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Falta el id del ticket" }, { status: 400 });

  after(async () => {
    const supabase = createAdminClient();
    try {
      const { data: ticket } = await supabase.from("tickets").select("id, foto_path").eq("id", id).single();
      if (!ticket) return;

      const { data: archivo } = await supabase.storage.from("tickets").download(ticket.foto_path);
      if (!archivo) throw new Error("No se pudo descargar la foto del ticket");

      const buffer = Buffer.from(await archivo.arrayBuffer());
      const mediaType = ticket.foto_path.endsWith(".png") ? "image/png" : "image/jpeg";
      const datos = await analyzeTicket(buffer.toString("base64"), mediaType);

      const hoy = new Date().toISOString().slice(0, 10);
      const limite = datos.fecha_compra ? fechaLimite(datos.fecha_compra) : null;
      let status = "PENDIENTE";
      if (!datos.legible || !datos.tienda || !datos.fecha_compra) status = "INCOMPLETO";
      else if (limite && limite < hoy) status = "VENCIDO";

      await supabase
        .from("tickets")
        .update({
          tienda: datos.tienda,
          fecha_compra: datos.fecha_compra,
          monto: datos.monto,
          folio: datos.folio,
          datos_extra: datos.datos_extra ?? {},
          fecha_limite: limite,
          status,
          notas: datos.notas,
        })
        .eq("id", id);
    } catch (error) {
      console.error("Error analizando ticket:", error);
      await supabase
        .from("tickets")
        .update({ status: "INCOMPLETO", notas: `Análisis falló: ${String(error).slice(0, 280)}` })
        .eq("id", id);
    }
  });

  return NextResponse.json({ ok: true });
}
