# Check page design

The page answers one question for someone about to send money: will this land? Structure
and behaviour follow Apple's Human Interface Guidelines, ported to the web. The look is the
page's own. Tokens live in `src/tokens.css`; this file says why, and the rules for using them.

## Who and where

Someone holding a deposit address and a memo, usually on a phone, often nervous. The page
is built phone-first and works the same on a desktop with a keyboard.

## Identity

- Paper and ink. The background is a pale security-paper grey-green and text is a dark ink
  navy. The page should feel like a document you check before you sign, not a dashboard.
- The address is the hero. After a check, the destination is set large in IBM Plex Mono and
  split into groups of four, the way people compare addresses by eye. Plex Mono is chosen
  because 0, O, 1, l and I are easy to tell apart.
- A guilloche band, the fine engraved line pattern from cheques and banknotes, sits behind
  the headline. It is generated SVG, not an image or an icon.
- Archivo at an expanded width carries the headline and the verdict. Everything else uses
  the system font.

## Rules

- Type: the HIG scale in `tokens.css`. Six sizes, no others. Build hierarchy with weight and
  colour before size. Body copy is opened up to 1.55 line height; labels and rows stay tight.
- Spacing: the 4px-based scale only. No arbitrary values.
- Targets: every control is at least 44px in both directions, with 8px between neighbours.
- Colour: semantic tokens only. Verdict colours always come with a word ("Stop", "Check
  first", "Looks fine") so colour never carries meaning alone. Text clears 4.5:1 and control
  edges clear 3:1 in both themes.
- Radius: `--radius-control` for fields and buttons, `--radius-panel` for the verdict. Nothing
  else is rounded.
- Elevation: the page is flat. The one floating element is the privacy notice at the bottom,
  which is the functional layer and the only place translucent glass is used. It falls back
  to a solid surface without `backdrop-filter`, with reduced transparency, or with increased
  contrast.
- Motion: one reveal, when a verdict arrives (280ms, ease-out). State changes take 150ms.
  Reduced motion turns both off.
- Focus: every interactive element shows a 2px accent ring on `:focus-visible`.
- No icons. Status is a word and a colour, not a glyph.
- Zoom: never capped. The layout holds at 200%.

## Fonts and privacy

All fonts are bundled from Fontsource at build time and served from the site itself. The
page makes no request to a font CDN. It sets no cookies and runs no analytics.
