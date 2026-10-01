import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FieldWise",
    short_name: "FieldWise",
    description:
      "AI-powered smart irrigation system for predictive water management and crop optimization.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7f4",
    theme_color: "#16a34a",
    orientation: "portrait",
    scope: "/",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}