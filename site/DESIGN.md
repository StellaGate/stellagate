# Check page design

The site answers one question for someone about to send money: will this land? Structure
and behaviour follow Apple's Human Interface Guidelines, ported to the web. The look is the
site's own. Tokens live in `src/tokens.css`; this file says why, and the rules for using them.

## Who and where

Someone holding a deposit address and a memo, usually on a phone, often nervous. Both pages
are built phone-first and work the same on a desktop with a keyboard.

## Identity

- Paper and ink. The background is a pale security-paper grey-green and text is a dark ink
  navy. The site should feel like a document you check before you sign, not a dashboard.
- The address is the hero. After a check, the destination is set large in IBM Plex Mono and
  split into groups of four, the way people compare addresses by eye. Plex Mono is chosen
  because 0, O, 1, l and I are easy to tell apart.
- A guilloche band, the fine engraved line pattern from cheques and banknotes, appears on
  the check page, behind the Security heading and in the closing section. It is generated
  SVG, not an image or an icon.
- Geist carries every heading and all running text, with tight tracking (`--tracking-display`)
  from Title 2 up. Plex Mono is only for addresses, codes and URLs.

## Landing page

The landing page is a ruled frame: a hairline on each side, top to bottom, and sections
divided into cells by hairlines rather than floating cards. Read across a row like a spec
sheet. The reference for this structure was spidra.io; the colour, type and ornament are ours.

- Hero: the dusk painting (`src/assets/hero-landscape.jpg`) under a scrim, with a small
  mockup of the check page below the call to action. The mockup shows a real verdict, dated
  in its caption; if the copy in `app.ts` changes, the mockup text changes with it.
- Pictures are fragments of the check page's own rows, not illustrations or icons.
- Ornament is drawn in outline: corner marks around the mockup, outlined step numerals and an
  outlined wordmark closing the frame. Outline ornament never competes with content.
- The macOS window controls on the mockup are a deliberate choice by the owner. They are
  decorative, use the `--dot-*` tokens and are hidden from assistive technology.

## Rules

- Type: the HIG scale in `tokens.css`. Six sizes, plus `--text-display` for the landing hero
  and the outlined numerals. The outlined wordmark scales with the frame width and is the one
  size off the scale. Build hierarchy with weight and colour before size. Body copy is opened
  up to 1.55 line height; labels and rows stay tight.
- Spacing: the 4px-based scale only. No arbitrary values.
- Targets: every control is at least 44px in both directions, with 8px between neighbours.
- Colour: semantic tokens only. Verdict colours always come with a word ("Stop", "Check
  first", "Looks fine") so colour never carries meaning alone. Text clears 4.5:1 and control
  edges clear 3:1 in both themes. Text over the painting uses the `--on-image` tokens.
- Radius: `--radius-control` for fields and buttons, `--radius-panel` for the verdict, the
  nav bar and the mockup. `--radius-pill` is reserved. Nothing else is rounded.
- Elevation: the page is flat. Two layers float: the landing nav bar (solid, not glass) and
  the privacy notice, which is the one place translucent glass is used. The hero mockup is
  raised off the painting. All three use `--shadow-raised`. The notice falls back to a solid
  surface without `backdrop-filter`, with reduced transparency, or with increased contrast.
- Motion: one reveal, when a verdict arrives (280ms, ease-out). State changes take 150ms.
  Nothing animates on scroll. Reduced motion turns both off.
- Focus: every interactive element shows a 2px accent ring on `:focus-visible`.
- No icons. Status is a word and a colour, not a glyph. The FAQ uses the browser's own
  disclosure marker.
- Zoom: never capped. The layout holds at 200%.

## Fonts and privacy

All fonts are bundled from Fontsource at build time and served from the site itself. The
site makes no request to a font CDN. It sets no cookies and runs no analytics.
