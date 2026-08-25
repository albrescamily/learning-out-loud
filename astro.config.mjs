import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  site: "https://example.com",

  // Start fetching a page as soon as a link is hovered or focused, so moving
  // between sections lands on an already-downloaded document.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover"
  },

  fonts: [
    {
      name: "IBM Plex Sans",
      cssVariable: "--font-sans",
      provider: fontProviders.google(),
      weights: [500, 700],
      styles: ["normal"],
      subsets: ["latin"],
      // `optional` is what stops the font swapping mid-render: the browser
      // either has the file in time (it is preloaded, and cached from the
      // first page on) or keeps the metric-matched fallback for that load.
      // With `swap` — the default — every navigation repainted the text.
      display: "optional",
      fallbacks: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"]
    },
    {
      name: "IBM Plex Mono",
      cssVariable: "--font-mono",
      provider: fontProviders.google(),
      weights: [500, 700],
      styles: ["normal"],
      subsets: ["latin"],
      display: "optional",
      fallbacks: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"]
    }
  ]
});
