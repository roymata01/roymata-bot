import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Chromium serverless para generar los PDF de cotizaciones
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // El binario brotli de Chromium debe viajar con la función (el trazador no lo ve)
  outputFileTracingIncludes: {
    "/api/cotizaciones/generar": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
