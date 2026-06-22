// Renders ONE map image showing all nearby spots as numbered pins plus the
// driver's location — the in-chat "Google-Maps-style" overview. Uses OpenStreetMap
// tiles (no API key) composed server-side via `staticmaps`; pin icons are tiny
// SVGs rasterised with sharp and cached on disk so we only build each once.
import StaticMaps from 'staticmaps';
import sharp from 'sharp';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

// Tile source is overridable (MAP_TILE_URL) so a busier deployment can point at a
// provider with a proper usage allowance instead of the public OSM servers.
const TILE_URL = process.env.MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ICON_DIR = join(tmpdir(), 'parkaddis-markers');

// Per-tile fetch timeout and an overall render budget. Without these a slow or
// rate-limited tile server would hang the request forever (got has no default
// timeout), and a hang — unlike a throw — would slip past the caller's try/catch.
const TILE_TIMEOUT_MS = 5000;
const RENDER_BUDGET_MS = 12000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Pin geometry (a classic teardrop). Anchor is the bottom tip.
const PIN_W = 30;
const PIN_H = 40;

function numberedPinSvg(n) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W}" height="${PIN_H}" viewBox="0 0 30 40">
    <path d="M15 0C7 0 .5 6.5.5 14.5.5 25 15 40 15 40s14.5-15 14.5-25.5C29.5 6.5 23 0 15 0z" fill="#e11d48" stroke="#fff" stroke-width="1.5"/>
    <circle cx="15" cy="14.5" r="9.5" fill="#fff"/>
    <text x="15" y="19.5" font-size="14" font-family="Arial, sans-serif" font-weight="bold" fill="#e11d48" text-anchor="middle">${n}</text>
  </svg>`;
}

const ME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <circle cx="11" cy="11" r="9" fill="#2563eb" fill-opacity="0.25"/>
  <circle cx="11" cy="11" r="5" fill="#2563eb" stroke="#fff" stroke-width="2"/>
</svg>`;

// Rasterise an SVG to a cached PNG file once; return its path.
async function cacheIcon(file, svg) {
  if (existsSync(file)) return file;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(file, png);
  return file;
}

// Ensure the user dot + pins 1..count exist on disk; return their paths.
async function prepareIcons(count) {
  if (!existsSync(ICON_DIR)) mkdirSync(ICON_DIR, { recursive: true });
  const me = join(ICON_DIR, 'me.png');
  const jobs = [cacheIcon(me, ME_SVG)];
  const pins = [];
  for (let n = 1; n <= count; n++) {
    const file = join(ICON_DIR, `pin-${n}.png`);
    pins.push(file);
    jobs.push(cacheIcon(file, numberedPinSvg(n)));
  }
  await Promise.all(jobs);
  return { me, pins };
}

/**
 * Render a single PNG with every spot as a numbered pin (matching the order of
 * `spots`, 1-based) and the driver at `lat,lng`. Auto-fits all points. Returns a
 * Buffer; throws if tiles/render fail so callers can fall back to a text list.
 */
export async function renderNearbyMap({ lat, lng, spots, width = 640, height = 420 }) {
  const pinnable = spots.filter((s) => s.lat != null && s.lng != null);
  const { me, pins } = await prepareIcons(pinnable.length);

  const map = new StaticMaps({
    width,
    height,
    tileUrl: TILE_URL,
    paddingX: 40,
    paddingY: 60,
    tileRequestTimeout: TILE_TIMEOUT_MS,
  });

  map.addMarker({ coord: [Number(lng), Number(lat)], img: me, width: 22, height: 22, offsetX: 11, offsetY: 11 });
  pinnable.forEach((s, i) => {
    map.addMarker({
      coord: [Number(s.lng), Number(s.lat)],
      img: pins[i],
      width: PIN_W,
      height: PIN_H,
      offsetX: PIN_W / 2,
      offsetY: PIN_H, // bottom tip sits on the coordinate
    });
  });

  // Hard ceiling on the whole render so a stalled tile fetch can never hang the
  // chat — it surfaces as a rejection the caller catches and falls back from.
  await withTimeout(map.render(), RENDER_BUDGET_MS, 'map render');
  return map.image.buffer('image/png');
}
