import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Sincroniza el portafolio desde el Google Sheets de Roy (link CSV oculto) y
// guarda el snapshot diario (invertido/valor) para la gráfica de evolución.
// body: { snapshot_only?: boolean } — true = solo snapshot, sin leer el Sheets.

// "9.110,73" · "9110.73" · "$ 1,234.56" · "10,29%" → número
function parseNum(crudo: string): number | null {
  let s = String(crudo || "").replace(/[$%\s"]/g, "").trim();
  if (!s || /[a-zA-Z]/.test(s)) return null;
  const coma = s.lastIndexOf(","), punto = s.lastIndexOf(".");
  if (coma > -1 && punto > -1) {
    if (coma > punto) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (coma > -1) {
    // una sola coma: decimal si deja 1-2 dígitos al final, si no es de miles
    s = s.split(",").length === 2 && s.split(",")[1].length <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [], celda = "", enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') enComillas = false;
      else celda += c;
    } else if (c === '"') enComillas = true;
    else if (c === ",") { fila.push(celda); celda = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda); filas.push(fila); fila = []; celda = "";
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const conLlave = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!conLlave) {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { snapshot_only } = await req.json().catch(() => ({}));
  const supabase = createAdminClient();
  let actualizadas = 0;

  if (!snapshot_only) {
    const { data: config } = await supabase.from("inversiones_config").select("sheet_url").eq("id", 1).maybeSingle();
    const sheetUrl = config?.sheet_url || "";
    const idMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
    if (!idMatch) {
      return NextResponse.json(
        { error: "Configura primero el link de tu Google Sheets en el panel." },
        { status: 400 }
      );
    }

    const csvRes = await fetch(
      `https://docs.google.com/spreadsheets/d/${idMatch[1]}/gviz/tq?tqx=out:csv`,
      { cache: "no-store" }
    );
    if (!csvRes.ok) {
      return NextResponse.json(
        { error: `No pude leer el Sheets (HTTP ${csvRes.status}). ¿Está compartido como "cualquiera con el link puede ver"?` },
        { status: 502 }
      );
    }
    const filas = parseCsv(await csvRes.text());

    // localizar el encabezado por la celda CLAVE y mapear columnas por nombre
    const iHeader = filas.findIndex((f) => f.some((c) => c.trim().toUpperCase() === "CLAVE"));
    if (iHeader === -1) {
      return NextResponse.json({ error: "No encontré la columna CLAVE en el Sheets." }, { status: 422 });
    }
    const header = filas[iHeader].map((c) => c.trim().toUpperCase());
    const col = (busca: string) => header.findIndex((h) => h.includes(busca));
    const cClave = col("CLAVE"), cCosto = col("COSTO"), cCant = col("CANTIDAD"),
      cPrecio = col("PRECIO ACTUAL"), cObj = col("OBJETIVO");

    for (const f of filas.slice(iHeader + 1)) {
      const clave = (f[cClave] || "").trim().toUpperCase();
      if (!clave || clave.includes("FECHA")) break; // fin de la tabla de posiciones
      const cantidad = parseNum(f[cCant] ?? "");
      const costo = parseNum(f[cCosto] ?? "");
      const precio = parseNum(f[cPrecio] ?? "");
      if (cantidad == null || costo == null) continue; // fila sin datos (ej. TSMN vacía)
      const { error } = await supabase.from("inversiones").upsert(
        {
          clave,
          cantidad,
          costo_promedio: costo,
          precio_actual: precio ?? 0,
          objetivo: (f[cObj] || "").trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "clave" }
      );
      if (!error) actualizadas++;
    }
  }

  // snapshot del día (hora CDMX) con lo que haya en la base
  const { data: posiciones } = await supabase.from("inversiones").select("cantidad, costo_promedio, precio_actual");
  const invertido = (posiciones || []).reduce((s, p) => s + Number(p.cantidad) * Number(p.costo_promedio), 0);
  const valor = (posiciones || []).reduce((s, p) => s + Number(p.cantidad) * Number(p.precio_actual), 0);
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
  await supabase.from("inversiones_snapshots").upsert(
    { fecha: hoy, invertido: Math.round(invertido * 100) / 100, valor: Math.round(valor * 100) / 100 },
    { onConflict: "fecha" }
  );

  return NextResponse.json({ ok: true, actualizadas, invertido, valor });
}
