import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// `npm run icons` regenerates the PWA / iOS icons in public/ from public/app-icon.svg (a full-bleed brand tile).
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: "#00C805" } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: "#00C805" } },
  },
  images: ["public/app-icon.svg"],
});
