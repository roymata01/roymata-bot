// Plantilla de cotización VITA RESCUE (réplica fiel de la de Odoo que usa Roy).
// La versión canónica aprobada por Roy vive en ~/vita-cotizaciones (S11026).
// El logo va incrustado en base64 para que el render serverless no dependa de assets.
import { LOGO_B64 } from "./logo-b64";

export type DatosCotizacion = {
  folio: number; // 11027, 11028... se muestra como S11027
  dirigida: string;
  fecha: Date;
  numPersonas: number;
  precioUnitario: number; // por participante, sin IVA
  viaticos: number; // 0 = sin fila de viáticos
  notaViaticos?: string;
};

const CURSO_BASICO = {
  descripcionTabla: "Curso primeros auxilios básicos en adultos",
  nombre: "PRIMEROS AUXILIOS BÁSICO",
  objetivo:
    "Aprender las distintas habilidades de reconocimiento y tratamiento como primer respondiente en lesiones traumáticas y urgencias médicas dentro de un escenario seguro. Activar de forma oportuna los distintos tipos de apoyo necesarios.",
  temario: [
    "Principios Básicos",
    "Abordaje Del Paciente",
    "Incosciencia Vs Paro Cardiaco",
    "Rcp",
    "Ventilación De Rescate",
    "Heridas",
    "Control De Hemorragias",
    "Quemaduras",
    "Fracturas",
    "Luxaciones",
    "Inmovilización Y Manipulación De Extremidades",
    "EVC",
    "Convulsiones",
    "Atragantamiento",
  ],
  duracion: "5 horas.",
};

export function descuentoPorGrupo(personas: number): number {
  if (personas >= 61) return 20;
  if (personas >= 31) return 10;
  if (personas >= 21) return 5;
  return 0;
}

const mxn = (n: number) =>
  "$ " + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MXN";
const num = (n: number) => n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function calcularTotales(d: Pick<DatosCotizacion, "numPersonas" | "precioUnitario" | "viaticos">) {
  const subtotalCurso = d.numPersonas * d.precioUnitario;
  const pct = descuentoPorGrupo(d.numPersonas);
  const descuento = Math.round(subtotalCurso * (pct / 100) * 100) / 100;
  const total = subtotalCurso - descuento + (d.viaticos || 0);
  return { subtotalCurso, pct, descuento, total };
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
function fechaLarga(f: Date): string {
  return `${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}`;
}

export function htmlCotizacion(d: DatosCotizacion): string {
  const curso = CURSO_BASICO;
  const { pct, descuento, total } = calcularTotales(d);
  const vence = new Date(d.fecha.getTime() + 30 * 86400000);

  const filaViaticos = d.viaticos > 0
    ? `<tr>
        <td>Viáticos<br /><span class="sub">${d.notaViaticos || "Viaticos desde la ciudad de PUEBLA"}</span></td>
        <td class="num">1 Unidades</td>
        <td class="num">${num(d.viaticos)}</td>
        <td class="num">—</td>
        <td class="num">${mxn(d.viaticos)}</td>
      </tr>`
    : "";

  const filaDescuento = pct > 0
    ? `<tr>
        <td>Descuento por grupo (${d.numPersonas} personas)</td>
        <td class="num"></td>
        <td class="num">-${pct}%</td>
        <td class="num">—</td>
        <td class="num">- ${mxn(descuento)}</td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Cotización S${d.folio}</title>
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Lato", "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; font-size: 10pt; }
  .page { width: 210mm; height: 296mm; position: relative; page-break-after: always; overflow: hidden; background: #fff; }
  .page:last-child { page-break-after: auto; }
  .bar-top { height: 4mm; background: #1F2E5C; }
  .bar-bottom { height: 4mm; background: #1F2E5C; position: absolute; bottom: 0; left: 0; right: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding: 8mm 12mm 0 8mm; }
  .header img { width: 62mm; height: auto; }
  .empresa { text-align: left; width: 70mm; font-size: 9.5pt; line-height: 1.45; }
  .empresa b { font-size: 10pt; }
  .contenido { padding: 0 12mm 0 8mm; }
  .titulo { color: #9aa0a6; font-size: 20pt; font-weight: 700; margin: 8mm 0 5mm; }
  .navy { color: #1F2E5C; font-weight: 700; }
  .azul { color: #1a56db; }
  .meta { display: flex; gap: 4mm; margin-bottom: 6mm; font-size: 10pt; }
  .meta > div { flex: 1; }
  .meta .lbl { color: #1F2E5C; font-weight: 700; }
  table.items { width: 100%; border-collapse: collapse; font-size: 10pt; }
  table.items thead th { color: #1F2E5C; text-align: left; padding: 2.5mm 1.5mm; border-top: 1.1mm solid #1F2E5C; border-bottom: 0.4mm solid #1F2E5C; font-size: 9.5pt; }
  table.items thead th.num, table.items td.num { text-align: right; }
  table.items td { padding: 2.6mm 1.5mm; vertical-align: top; } table.items td.num { white-space: nowrap; }
  table.items .sub { color: #444; font-size: 9pt; }
  .total-row { display: flex; justify-content: flex-end; border-top: 1.1mm solid #1F2E5C; margin-top: 1mm; }
  .total-box { width: 88mm; display: flex; justify-content: space-between; padding: 3mm 1.5mm; border-bottom: 1.1mm solid #1F2E5C; font-weight: 700; }
  .seccion { margin-top: 4.2mm; line-height: 1.45; }
  .seccion .navy { font-size: 10.5pt; }
  ol.temario { margin: 1mm 0 0 5mm; line-height: 1.4; }
  ul.lista { list-style: none; margin-top: 1mm; line-height: 1.5; }
  ul.lista li::before { content: "● "; font-size: 8pt; }
  .footer { position: absolute; bottom: 6mm; left: 8mm; right: 8mm; display: flex; justify-content: space-between; align-items: flex-start; font-size: 9pt; line-height: 1.5; border-top: 0.3mm solid #d8dce6; padding-top: 2.5mm; }
  .footer .col { max-width: 60mm; }
  .footer .lema { font-size: 12pt; color: #1a1a1a; }
  .pagina { background: #1F2E5C; color: #fff; font-size: 8pt; width: 6mm; height: 6mm; display: flex; align-items: center; justify-content: center; border-radius: 1mm; }
  .dirigida { margin-top: 4mm; background: #F0F4FA; border-left: 1.2mm solid #1F2E5C; padding: 2.5mm 3.5mm; font-size: 10pt; }
</style>
</head>
<body>

<div class="page">
  <div class="bar-top"></div>
  <div class="header">
    <img src="data:image/png;base64,${LOGO_B64}" alt="VITA RESCUE" />
    <div class="empresa">
      <b>VITA RESCUE SA de CV</b><br />
      11 Sur 2906 int 13 72420 Heroica Puebla de Zaragoza, PUE<br />
      México
      <div class="dirigida">
        <span class="navy">Dirigida a:</span><br />
        ${d.dirigida}
      </div>
    </div>
  </div>

  <div class="contenido">
    <div class="titulo">Cotización S${d.folio}</div>

    <div class="meta">
      <div><span class="lbl">Fecha de cotización:</span><br />${fechaLarga(d.fecha)}</div>
      <div><span class="lbl">Vencimiento:</span><br />${fechaLarga(vence)}</div>
      <div><span class="lbl">Vendedor:</span><br />Administrador VITA</div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th style="width: 38%">DESCRIPCIÓN</th>
          <th class="num">CANTIDAD</th>
          <th class="num">PRECIO UNITARIO</th>
          <th class="num">IMPUESTOS</th>
          <th class="num">IMPORTE</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${curso.descripcionTabla}</td>
          <td class="num">${d.numPersonas} Unidades</td>
          <td class="num">${num(d.precioUnitario)}</td>
          <td class="num">—</td>
          <td class="num">${mxn(d.numPersonas * d.precioUnitario)}</td>
        </tr>
        ${filaDescuento}
        ${filaViaticos}
      </tbody>
    </table>
    <div class="total-row">
      <div class="total-box"><span class="navy">Total</span><span>${mxn(total)}</span></div>
    </div>

    <div class="seccion"><span class="navy">CURSO:</span> <b>${curso.nombre}</b></div>

    <div class="seccion"><span class="navy">OBJETIVO DEL CURSO:</span> ${curso.objetivo}</div>

    <div class="seccion">
      <span class="navy">TEMARIO:</span>
      <ol class="temario">
        ${curso.temario.map((t) => `<li>${t}</li>`).join("\n        ")}
      </ol>
    </div>

    <div class="seccion"><span class="navy">DURACIÓN:</span> ${curso.duracion}</div>
  </div>

  <div class="footer">
    <div class="col">vitarescuemx@gmail.com<br />http://www.vitarescue.com.mx</div>
    <div class="col">VITA RESCUE<br />11 Sur 2906 int 13 72420 Heroica <span style="font-size:7pt">Puebla de Zaragoza, PUE</span><br />México</div>
    <div class="col lema">"Aprender, Aplicar,<br />Salvar"</div>
    <div class="pagina">1</div>
  </div>
  <div class="bar-bottom"></div>
</div>

<div class="page">
  <div class="bar-top"></div>
  <div class="header">
    <img src="data:image/png;base64,${LOGO_B64}" alt="VITA RESCUE" />
    <div class="empresa">
      <b>VITA RESCUE SA de CV</b><br />
      11 Sur 2906 int 13 72420 Heroica Puebla de Zaragoza, PUE<br />
      México
    </div>
  </div>

  <div class="contenido" style="margin-top: 2mm">
    <div class="seccion">
      <span class="navy">INCLUYE:</span>
      <ul class="lista">
        <li>Constancia del Curso (validez de un año)</li>
        <li>Formato DC-3 Constancia de competencias o de habilidades laborales (Aplica a empresas)</li>
        <li>Constancia STOP THE BLEED© (Validez Internacional)</li>
      </ul>
    </div>

    <div class="seccion">
      <span class="navy">MATERIAL DE ENTREGA EN FORMATO DIGITAL:</span>
      <ul class="lista">
        <li>Manual STOP THE BLEED ©</li>
        <li>Reporte del curso (Opcional)</li>
      </ul>
    </div>

    <div class="seccion"><span class="navy">METODOLOGÍA:</span> Teórica – Práctica</div>

    <div class="seccion">
      <span class="navy">INVERSIÓN DEL CURSO:</span> $ ${num(d.precioUnitario)} pesos MXN por participante <b>NO</b> incluye IVA.
    </div>

    <div class="seccion">
      <span class="navy">TÉRMINOS Y CONDICIONES DE LA INSCRIPCIÓN INDIVIDUAL Y GRUPAL</span>
      <ul class="lista">
        <li>Se requiere un mínimo de 10 participantes para impartir el curso.</li>
        <li>No existen cancelaciones ni reembolso en caso de que el participante no asista al curso en el que se ha inscrito.</li>
        <li>Este precio únicamente será en cursos impartidos dentro de la Ciudad de Puebla. En casos donde se imparta fuera de la ciudad se anexarán costos por gastos de transportación, comida y hospedaje.</li>
      </ul>
    </div>

    <div class="seccion">
      Para grupos se aplicarán los siguientes descuentos:<br />
      No. De Personas Descuento<br />
      10 – 20 personas<br />
      21 - 30 personas 5% descuento<br />
      31 - 60 personas 10% descuento<br />
      61 - 120 personas 20% descuento
    </div>

    <div class="seccion">
      <span class="navy">CONDICIONES DE PAGO:</span>
      <ul class="lista">
        <li>El presupuesto tiene una vigencia de 30 días naturales a partir de esta fecha.</li>
        <li>Se mejoran presupuestos.</li>
        <li>El costo total del curso deberá cubrirse antes de la fecha agendada o según las condiciones establecidas con la empresa.</li>
      </ul>
    </div>

    <div class="seccion">
      Si realiza el pago vía transferencia electrónica o depósito en la cuenta, le solicitamos remitir copia a la
      dirección electrónica para confirmar su pago <a href="mailto:contacto@vitarescue.com.mx" class="azul" style="font-weight:700">contacto@vitarescue.com.mx</a>
      y enviar sus datos fiscales para la realización de la factura.
    </div>

    <div class="seccion">
      <span class="navy">VENTAJAS DEL CURSO:</span>
      <ul class="lista">
        <li>Los cursos son impartidos por instructores con formación pedagógica.</li>
        <li>Son basados en los lineamientos de Protección Civil y CENAPRED, AHA.</li>
        <li>Se realizan prácticas integrales.</li>
      </ul>
    </div>

    <div class="seccion" style="text-align:center">
      Esperando ser parte de la seguridad y filosofía de su empresa, estamos para servirles.<br />
      ATENTAMENTE<br />
      <b>TUM I. Rodrigo Mata Santillana</b><br />
      <b>Director VITA RESCUE</b>
    </div>
  </div>

  <div class="footer">
    <div class="col">http://www.vitarescue.com.mx</div>
    <div class="col">VITA RESCUE<br />11 Sur 2906 int 13 72420 Puebla</div>
    <div class="col lema">"Aprender, Aplicar,<br />Salvar"</div>
    <div class="pagina">2</div>
  </div>
  <div class="bar-bottom"></div>
</div>

</body>
</html>`;
}
