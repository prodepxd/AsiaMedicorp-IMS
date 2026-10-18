import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const existingLogo = readFileSync(new URL("./src/assets/asia-medicorp-logo.png", import.meta.url));

const pwaBrandAsset = {
  name: "pwa-existing-brand-logo",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "icons/asia-medicorp-logo.png",
      source: existingLogo,
    });
  },
};

export default defineConfig({
  base: "/AsiaMedicorp-IMS/",
  plugins: [react(), pwaBrandAsset],
});
