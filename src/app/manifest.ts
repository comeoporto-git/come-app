import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "COME Food Tours",
    short_name: "COME",
    description: "Porto Food Tours OS",
    start_url: "/guide",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f4f1",
    theme_color: "#7852ca",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
