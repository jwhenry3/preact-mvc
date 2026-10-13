// Builds the PreactMVC asset family from the Preact mark
// (preact-logo.svg — the official CC0 mark from simple-icons): the
// orbit swirl + nucleus, held inside an Angular-style SHIELD instead of
// the cube hexagon.
//
//   node build-logo.mjs  → all SVGs; rasterize PNGs via headless Edge:
//     msedge --headless --screenshot=out.png --window-size=N,N file.svg
//     (add --default-background-color=00000000 for transparency)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// ── source art extraction ──────────────────────────────────────────────
// The mark's path is one `d` whose subpaths are: nucleus circle, two
// orbit-band segments, and finally the cube hexagon `M 12,0 22.392,6 ...`.
// Everything before the last `M ` is the white swirl — that is what we
// keep; the hexagon is discarded in favour of the shield.
const SRC = readFileSync(join(here, 'preact-logo.svg'), 'utf8')
  .match(/d="([^"]+)"/)[1];
const SWIRL = SRC.slice(0, SRC.lastIndexOf('M ')).trim();

// Angular-style shield in the same 24×24 space the cube occupied:
// rounded peak and lower side corners (Q curves); pointed shoulder
// corners and a sharp bottom vertex. Vertically flattened about the
// shoulder line (y≈5.3, factor 0.85): spans 2.15→18.05.
const SHIELD =
  'M 10.28,2.84 Q 12,2.15 13.72,2.84 L 19.8,5.3 ' +
  'L 18.97,12.57 Q 18.78,14.26 17.11,15.19 L 12,18.05 ' +
  'L 6.89,15.19 Q 5.22,14.26 5.03,12.57 L 4.2,5.3 Z';

// The orbit was drawn to kiss the cube's flat sides; the shield narrows
// mid-height, so scale the swirl to sit inside (0.7) AND recenter it on
// the shield's visual center (12,10.1) rather than the square's (12,12).
const SWIRL_T = 'translate(3.6 1.7) scale(0.7)';

// ── mark on the 500×550 canvas (scale 15) ─────────────────────────────
// The shield's own center is y=10.1 in the 24-unit space, so translate
// y = 225 - 10.1*15 puts the mark's visual center at canvas 250,225.
function mark(shieldInk, orbitInk) {
  return `
  <g transform="translate(70 73.5) scale(15)">
    <path d="${SHIELD}" fill="${shieldInk}"/>
    <g transform="${SWIRL_T}"><path d="${SWIRL}" fill="${orbitInk}"/></g>
  </g>`;
}

// Knock-out mark: the orbit becomes a transparent hole via mask — the
// background shows through, so one file works on any surface.
function markKnockout(ink) {
  return `
  <defs><mask id="knockout"><path d="${SHIELD}" fill="#fff"/>
    <g transform="${SWIRL_T}"><path d="${SWIRL}" fill="#000"/></g></mask></defs>
  <g transform="translate(70 73.5) scale(15)">
    <path d="${SHIELD}" fill="${ink}" mask="url(#knockout)"/>
  </g>`;
}

const TEXT = (ink) => `
  <text x="250" y="445" font-family="system-ui, -apple-system, sans-serif"
        font-weight="800" font-size="38" fill="${ink}" text-anchor="middle"
        letter-spacing="1">Preact<tspan fill="#673ab8">MVC</tspan></text>
  <text x="250" y="480" font-family="system-ui, -apple-system, sans-serif"
        font-weight="600" font-size="14" fill="${ink}" text-anchor="middle"
        letter-spacing="3">ANGULAR-STYLE MVC ON PREACT</text>`;

// ── variants ────────────────────────────────────────────────────────────
const PURPLE = '#673ab8';
const ORBIT = '#ffffff';

const svg = (viewBox, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>\n`;

const themed = (bg0, bg1, ink, viewBox = '0 0 500 550') =>
  svg(
    viewBox,
    `
  <defs><radialGradient id="bg" cx="50%" cy="45%" r="75%">
    <stop offset="0%" stop-color="${bg0}"/><stop offset="100%" stop-color="${bg1}"/>
  </radialGradient></defs>
  <rect width="500" height="550" fill="url(#bg)"/>${mark(PURPLE, ORBIT)}${TEXT(ink)}`
  );

// full logo — lavender wash / deep violet panel, brand purple shield
writeFileSync(join(here, 'preactmvc-light.svg'), themed('#f2edfc', '#dcd0f5', '#3c1d95'));
writeFileSync(join(here, 'preactmvc-dark.svg'), themed('#2e1a5e', '#150a33', '#e6ddff'));

// transparent full logo — mark + wordmark, no panel (for themed pages)
writeFileSync(
  join(here, 'preactmvc-light-t.svg'),
  svg('0 0 500 550', mark(PURPLE, ORBIT) + TEXT('#3c1d95'))
);
writeFileSync(
  join(here, 'preactmvc-dark-t.svg'),
  svg('0 0 500 550', mark(PURPLE, ORBIT) + TEXT('#e6ddff'))
);

// compact — artwork region only, square crop with even margins (shield
// bounds x133–367 / y84.75–365.25 on the canvas, center 250,225)
writeFileSync(join(here, 'preactmvc-compact-light.svg'), themed('#f2edfc', '#dcd0f5', '#3c1d95', '80 55 340 340'));
writeFileSync(join(here, 'preactmvc-compact-dark.svg'), themed('#2e1a5e', '#150a33', '#e6ddff', '80 55 340 340'));

// favicon — mark only, no text, tight 1:1 square bounding the shield.
// The orbit is transparent (knock-out) so a single file works on light
// and dark browser chrome alike. `-white` is for brand-colored bars
// (the orbit shows the bar's purple through).
writeFileSync(
  join(here, 'preactmvc-icon.svg'),
  svg('100 75 300 300', markKnockout(PURPLE))
);
writeFileSync(
  join(here, 'preactmvc-icon-white.svg'),
  svg('100 75 300 300', markKnockout('#ffffff'))
);

// horizontal lockup — mark left, wordmark + tagline right. Transparent.
const horizontal = (ink) =>
  svg(
    '0 0 580 200',
    `
  <g transform="translate(${90 - 250 * 0.58} ${100 - 225 * 0.58}) scale(0.58)">
${mark(PURPLE, ORBIT)}
  </g>
  <text x="200" y="115" font-family="system-ui, -apple-system, sans-serif"
        font-weight="800" font-size="58" fill="${ink}" letter-spacing="1">Preact<tspan fill="${PURPLE}">MVC</tspan></text>
  <text x="203" y="152" font-family="system-ui, -apple-system, sans-serif"
        font-weight="600" font-size="17" fill="${ink}" letter-spacing="2.6">ANGULAR-STYLE MVC ON PREACT</text>`
  );
writeFileSync(join(here, 'preactmvc-horizontal-light.svg'), horizontal('#3c1d95'));
writeFileSync(join(here, 'preactmvc-horizontal-dark.svg'), horizontal('#e6ddff'));

// brand lockup — mark + wordmark sized so the text fills the icon's height.
const brand = (ink) =>
  svg(
    '0 8 780 240',
    `
  <g transform="translate(${100 - 250 * 0.62} ${128 - 225 * 0.62}) scale(0.62)">
${mark(PURPLE, ORBIT)}
  </g>
  <text x="212" y="172" font-family="system-ui, -apple-system, sans-serif"
        font-weight="800" font-size="96" fill="${ink}" letter-spacing="1">Preact<tspan fill="${PURPLE}">MVC</tspan></text>
  <text x="216" y="225" font-family="system-ui, -apple-system, sans-serif"
        font-weight="600" font-size="30" fill="${ink}" letter-spacing="2.4">ANGULAR-STYLE MVC ON PREACT</text>`
  );
writeFileSync(join(here, 'preactmvc-brand-light.svg'), brand('#3c1d95'));
writeFileSync(join(here, 'preactmvc-brand-dark.svg'), brand('#e6ddff'));

// social card — 1200×630 og:image. Dark panel + brand lockup centered;
// rasterize with --window-size=1200,630 (the opaque dark panel reads on
// light and dark chat/social themes alike).
writeFileSync(
  join(here, 'preactmvc-social.svg'),
  svg(
    '0 0 1200 630',
    `
  <defs><radialGradient id="bg" cx="50%" cy="45%" r="75%">
    <stop offset="0%" stop-color="#2e1a5e"/><stop offset="100%" stop-color="#150a33"/>
  </radialGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(100.8 151.2) scale(1.28)">
    <g transform="translate(${100 - 250 * 0.62} ${128 - 225 * 0.62}) scale(0.62)">
${mark(PURPLE, ORBIT)}
    </g>
    <text x="212" y="172" font-family="system-ui, -apple-system, sans-serif"
          font-weight="800" font-size="96" fill="#e6ddff" letter-spacing="1">Preact<tspan fill="${PURPLE}">MVC</tspan></text>
    <text x="216" y="225" font-family="system-ui, -apple-system, sans-serif"
          font-weight="600" font-size="30" fill="#e6ddff" letter-spacing="2.4">ANGULAR-STYLE MVC ON PREACT</text>
  </g>`,
  ),
);

// monochrome mark — single-color glyph for badges/inline use; the orbit
// is a knock-out so it works over any background.
writeFileSync(join(here, 'preactmvc-mark.svg'), svg('100 75 300 300', markKnockout('currentColor')));

console.log('wrote preactmvc-{light,dark}.svg, preactmvc-{light,dark}-t.svg, preactmvc-compact-{light,dark}.svg, preactmvc-icon{,-white}.svg, preactmvc-horizontal-{light,dark}.svg, preactmvc-brand-{light,dark}.svg, preactmvc-mark.svg, preactmvc-social.svg');
