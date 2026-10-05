import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import config from "./site.config.json" with { type: "json" };

const contactEmail = process.env.CONTACT_EMAIL || config.contactEmail;

const partial = (name: string) => readFileSync(resolve(import.meta.dirname, "src/partials", `${name}.html`), "utf8");

function sitePartials(isBuild: boolean): Plugin {
  return {
    name: "site-partials",
    buildStart() {
      if (isBuild && !contactEmail) {
        throw new Error("site.config.json: contactEmail is empty. The privacy policy needs a contact address before the site can be built.");
      }
    },
    transformIndexHtml(html) {
      const contact = contactEmail || "CONTACT EMAIL NOT SET";
      return html
        .replace("<!--header-->", partial("header"))
        .replace("<!--nav-->", partial("nav"))
        .replace("<!--footer-->", partial("footer"))
        .replace("<!--notice-->", partial("notice"))
        .replaceAll("{{contact}}", contact)
        .replaceAll("{{repo}}", config.repo)
        .replaceAll("{{updated}}", config.legalUpdated);
    },
  };
}

function appRewritePlugin(): Plugin {
  return {
    name: "app-rewrite",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url?.split("?")[0];
        const pages = ["app", "batch", "memo", "docs", "playground"];
        for (const p of pages) {
          if (url === `/${p}` || url === `/${p}/`) {
            req.url = `/${p}.html` + (req.url?.includes("?") ? `?${req.url.split("?")[1]}` : "");
            break;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: process.env.BASE_PATH ?? "/",
  resolve: { alias: { "@stellagate/core": resolve(import.meta.dirname, "../src/index.ts") } },
  server: { fs: { allow: [".."] } },
  plugins: [sitePartials(command === "build"), appRewritePlugin()],
  build: {
    target: "es2022",
    rollupOptions: {
      input: Object.fromEntries(
        ["index", "app", "batch", "memo", "docs", "playground", "privacy", "terms", "cookies"].map((p) => [
          p,
          resolve(import.meta.dirname, `${p}.html`),
        ]),
      ),
    },
  },
}));
