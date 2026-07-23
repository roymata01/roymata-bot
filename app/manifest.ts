import type { MetadataRoute } from "next";

// Manifest PWA: permite "Agregar a pantalla de inicio" en el teléfono y que
// el panel se abra como app propia (sin barra del navegador).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VITA RESCUE — Sistema",
    short_name: "VITA",
    description: "El sistema de Roy: inbox con IA, CRM, cotizaciones, finanzas y facturación",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#0c0d10",
    theme_color: "#0c0d10",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
