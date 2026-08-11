// Render de HTML → PDF. En Vercel usa el Chromium serverless de @sparticuz;
// en local (desarrollo) usa el Chrome instalado en la Mac.
import puppeteer from "puppeteer-core";

const CHROME_LOCAL = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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
