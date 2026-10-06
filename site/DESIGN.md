# Site design

The site answers one question for someone about to send money: will this land? Structure
and behaviour follow Apple's Human Interface Guidelines, ported to the web. The look is the
site's own. Tokens live in `src/tokens.css`; this file says why, and the rules for using them.

## Who and where

Someone holding a deposit address and a memo, usually on a phone, often nervous. Every page
is built phone-first and works the same on a desktop with a keyboard.

## Identity

- Paper and ink. The background is a pale security-paper grey-green and text is a dark ink
  navy. The site should feel like a document you check before you sign, not a dashboard.
- The address is the hero. After a check, the destination is set large in IBM Plex Mono and
  split into groups of four, the way people compare addresses by eye. Plex Mono is chosen
  because 0, O, 1, l and I are easy to tell apart.
- A guilloche, the fine engraved line pattern from cheques and banknotes, sits behind the ink
  call-to-action cell and the closing panel. It is generated SVG (`src/guilloche.ts`), never
  an image.
- Geist carries every heading and all running text. Plex Mono is only for addresses, codes
  and URLs.

## Stylesheets

They load in this order, and a later file may override an earlier one:

1. `tokens.css`: every value. Nothing else defines a colour, size, duration or radius.
2. `styles.css`: shared components, the check page and the verdict modal.
3. `landing.css`: the landing page, plus the frame, cells and rules other pages reuse.
4. `system.css`: the shared footer, the legal-page frame and the type weights.
5. `inner.css`: tool pages (Batch, Memo Lab, Playground, Docs, the check page).
6. `motion.css`: landing motion only.

Partials in `src/partials/` (`nav`, `header`, `footer`, `notice`) are inlined once per page at
build time by the plugin in `vite.config.ts`. Change a partial, not its copies.

## Landing page

The landing page is a ruled frame: a hairline on each side, top to bottom, and sections
divided into cells by hairlines instead of floating cards. Horizontal rules run the full
width of the screen; side rules start below the hero. Read across a row like a spec sheet.

### Hero

The dusk painting (`src/assets/hero-landscape.jpg`) under a scrim, set inside a light frame:

- A smooth S-curve notch at the top holds the logo. The nav sits inside the panel, its items
  centred on the notch's middle line.
- Gentle bulges at the middle of each side, hidden under 40rem.
- At the bottom the panel dips into a thick frame band in a rounded U, with the down arrow
  inside it.

The bottom shape is a CSS mask on `.hero-panel`, not overlay shapes. Its layers overlap by one
pixel so no seam line appears at fractional heights. Do not go back to overlays. The painting
lives on `.hero-panel::before` so it can settle in without moving the mask.

### Below the hero

- The product shot: a browser window (macOS dots, an owner's choice, decorative and hidden
  from assistive technology) showing the check page dimmed behind the real verdict pop-up for
  Bybit's `GDT7ARDY...MTIH`. The pop-up is built from the modal's own classes, so if the
  verdict copy in `app.ts` changes, change the mockup with it.
- How it works: six cells, each with an outlined numeral tucked under its top edge.
- Features, then the ink call-to-action cell.
- Use cases. Each "Try it" link opens a live check, verified against mainnet.
- Built for wallets: TypeScript, Node.js and Result tabs. One pill slides between tabs as a
  clipped bar, so nothing re-lays out. Arrow keys move between tabs.
- FAQ on the browser's native disclosure, then the closing panel and the footer.

A floating pill nav appears once the hero nav scrolls out of view.

## Tool pages

Batch, Memo Lab, Playground, Docs and the check page keep their in-app header (logo, links,
buttons). Below it they take the landing look: the ruled frame with full-width rules, a page
title block shaped like a landing section head, hairline cells in place of boxed cards, pill
segmented controls, light code panels and the shared footer. `inner.css` does this by
overriding the older card styles in `styles.css`, scoped to `body.inner-page`.

## Footer

One partial on every page: the top half of a large outlined "Stellagate" wordmark, then one
line. GitHub and library icons on the left; Terms, Privacy and a cookie icon on the right.
Nothing else goes in it.

## Rules

- Type: the HIG scale in `tokens.css` for tool pages, and a marketing scale for the landing
  page (`--text-hero` 64, `--text-section` 48, `--text-lead` 18, `--text-numeral` 112). The
  marketing scale is taste overriding the HIG; targets stay at 44px. The outlined wordmark
  scales with the frame and is the one size off both scales.
- Weight: headings 500, running text 400, labels 500. Only verdict words reach 600. Every page
  sets antialiased font smoothing, because macOS renders Geist 400 too heavy without it.
- Spacing: the 4px-based scale only. No arbitrary values.
- Targets: every control is at least 44px in both directions, with 8px between neighbours.
- Colour: semantic tokens only. Text clears 4.5:1 and control edges clear 3:1 in both themes.
  Text over the painting uses the `--on-image` tokens.
- Status: a Phosphor fill icon in the verdict colour (check, X, warning), with the word kept as
  screen-reader text, so colour never carries meaning alone. Use `statusIconHtml()` from
  `src/status-icon.ts`; the check page keeps its own copy. Beyond status, the only icons are
  the GitHub, library and cookie links and the nav's menu chevron.
- Radius: every button, chip and segmented control is a full pill. `--radius-control` for
  fields, code panels and cells' inner panels, `--radius-panel` for the verdict and the
  mockup, `--radius-hero` for the painting panel.
- Elevation: the page is flat. Raised (`--shadow-raised`) is for the floating nav, the privacy
  notice, the product shot and fragments inside the feature visuals.
- Glass: in two places only. The privacy notice, and a full-panel liquid-glass layer over the
  guilloche in the call-to-action cell and the closing panel. Each falls back to a solid
  surface without `backdrop-filter`, with reduced transparency, or with increased contrast.
- Motion: only `transform` and `opacity` move. Arrive with `--ease-arrive`, leave with
  `--ease-leave`. On load the painting settles (1200ms) and the hero text cascades in 60ms
  apart. On scroll, each section head and each cell's contents rise once (560ms); the ruled
  lines never move. The product shot plays once when half visible: the address types in, the
  button presses, the backdrop dims and the verdict rises. State changes take 150ms; a
  verdict arriving takes 280ms. Reduced motion skips all of it and shows the final state.
- Focus: every interactive element shows a 2px accent ring on `:focus-visible`.
- Zoom: never capped. The layout holds at 200%.
- Layout: grid children that hold code need `min-width: 0`, or phones scroll sideways.

## Fonts and privacy

All fonts are bundled from Fontsource at build time and served from the site itself. The
site makes no request to a font CDN and runs no analytics. Its one cookie,
`stellagate_cookie_consent`, records that the privacy notice was accepted, and the cookie
policy lists it with the matching local storage keys.
