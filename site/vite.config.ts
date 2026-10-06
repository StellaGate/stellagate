import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import config from "./site.config.json" with { type: "json" };

const contactEmail = process.env.CONTACT_EMAIL || config.contactEmail;

const partial = (name: string) => readFileSync(resolve(import.meta.dirname, "src/partials", `${name}.html`), "utf8");

// The header's right-hand action differs per page; everything else is shared.
const HEADER_ACTIONS: Record<string, string> = {
  app: `<div class="app-net-pill" id="app-net-pill" role="status" aria-label="Selected network: Mainnet">
        <span class="net-dot" aria-hidden="true"></span>
        <span id="app-net-name">Mainnet</span>
      </div>`,
  docs: `<a class="button button-primary" href="./playground.html">SDK Playground</a>`,
  playground: `<a class="button button-primary" href="./docs.html">Developer docs</a>`,
};
const DEFAULT_ACTION = `<a class="button button-primary" href="./app.html">Single check</a>`;

// `<!--header page="batch"-->` marks Batch as the current page in every nav list.
function header(page?: string): string {
  let html = partial("header").replace("<!--header-action-->", (page && HEADER_ACTIONS[page]) || DEFAULT_ACTION);
  if (!page) return html;
  const href = `href="./${page}.html"`;
  html = html
    .replaceAll(`${href} class="`, `${href} aria-current="page" class="is-active `)
    .replaceAll(`${href}>`, `${href} aria-current="page" class="is-active">`);
  if (page === "docs" || page === "playground") html = html.replace('nav-dropdown-trigger"', 'nav-dropdown-trigger is-active"');
  return html;
}

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
        .replace(/<!--header(?: page="(\w+)")?-->/, (_, page?: string) => header(page))
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
