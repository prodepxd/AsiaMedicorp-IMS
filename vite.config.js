import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import sharp from "sharp";

const existingLogo = readFileSync(new URL("./src/assets/asia-medicorp-logo.png", import.meta.url));

// GitHub Pages hosts this app under a repository subpath. Vercel previews
// host each deployment at the domain root, so select the base automatically
// from Vercel's documented build environment instead of relying on a dashboard
// build-command override.
const base = process.env.VERCEL === "1" ? "/" : "/AsiaMedicorp-IMS/";

const pwaBrandAssets = {
  name: "pwa-existing-brand-logo",
  async generateBundle() {
    const icons = await Promise.all(
      [
        { size: 192, fileName: "icons/asia-medicorp-icon-192.png" },
        { size: 512, fileName: "icons/asia-medicorp-icon-512.png" },
      ].map(async ({ size, fileName }) => ({
        type: "asset",
        fileName,
        source: await sharp(existingLogo)
          .resize(size, size, { fit: "contain", background: "#ffffff" })
          .png()
          .toBuffer(),
      }))
    );

    for (const icon of icons) this.emitFile(icon);
  },
};

export default defineConfig({
  base,
  plugins: [react(), pwaBrandAssets],
});
