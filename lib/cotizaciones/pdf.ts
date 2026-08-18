// Render de HTML → PDF. En Vercel usa el Chromium serverless de @sparticuz;
// en local (desarrollo) usa el Chrome instalado en la Mac.
import puppeteer from "puppeteer-core";

const CHROME_LOCAL = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// PDF + imagen de la PRIMERA hoja. La imagen es para la pantalla de
// aprobación en el celular: los visores de PDF embebidos fallan ahí, una
// foto de la hoja se ve completa siempre.
export async function htmlAPdfConPreview(html: string): Promise<{ pdf: Buffer; preview: Buffer | null }> {
  const { browser, page } = await abrirPagina(html);
  try {
    const pdf = Buffer.from(
      await page.pdf({ format: "a4", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
    );
    let preview: Buffer | null = null;
    try {
      const hoja = await page.$(".page");
      if (hoja) preview = Buffer.from(await hoja.screenshot({ type: "png" }));
    } catch (e) {
      console.error("Preview de la cotización:", e);
    }
    return { pdf, preview };
  } finally {
    await browser.close();
  }
}

async function abrirPagina(html: string) {
  let executablePath: string;
  let args: string[] = [];
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
  } else {
    executablePath = CHROME_LOCAL;
    args = ["--no-sandbox"];
  }
  const browser = await puppeteer.launch({ executablePath, args, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "load" });
  return { browser, page };
}

export async function htmlAPdf(html: string): Promise<Buffer> {
  let executablePath: string;
  let args: string[] = [];

  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
  } else {
    executablePath = CHROME_LOCAL;
    args = ["--no-sandbox"];
  }

  const browser = await puppeteer.launch({ executablePath, args, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
