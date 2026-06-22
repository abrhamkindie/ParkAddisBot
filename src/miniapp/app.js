/* global L */
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const params = new URLSearchParams(location.search);
const lat = parseFloat(params.get('lat'));
const lng = parseFloat(params.get('lng'));
const bot = params.get('bot') || '';

const statusEl = document.getElementById('status');
const cardEl = document.getElementById('card');

function setStatus(msg) {
  if (msg) { statusEl.textContent = msg; statusEl.style.display = 'block'; }
  else { statusEl.style.display = 'none'; }
}

// Never leave a blank "Loading map…" screen on a script error — surface the real
// reason so it's debuggable on the phone instead of a silent white page.
window.addEventListener('error', (e) => {
  setStatus('Map error: ' + (e.message || e.error || 'failed to load'));
});
if (typeof L === 'undefined') {
  setStatus('Map library failed to load. Check your connection and reopen.');
}

function fmtDist(m) {
  if (m == null) return '';
  return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
}
function stars(avg, count) {
  return count ? '⭐ ' + Number(avg).toFixed(1) + ' (' + count + ')' : 'No ratings yet';
}
function directionsUrl(la, ln) {
  return 'https://www.google.com/maps/dir/?api=1&destination=' + la + ',' + ln;
}

// Declared before the call below — startMap() assigns `map`, so the binding must
// be initialised first (otherwise it's a temporal-dead-zone ReferenceError).
let map;
let routeLayer = null;

if (!isFinite(lat) || !isFinite(lng)) {
  setStatus('Location missing. Open this from the bot after sharing your location.');
} else {
  startMap();
}

function startMap() {
  map = L.map('map', { zoomControl: true }).setView([lat, lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  }).addTo(map);

  const meIcon = L.divIcon({ className: 'me-icon', html: '<div class="me-dot"></div>', iconSize: [16, 16] });
  L.marker([lat, lng], { icon: meIcon }).addTo(map).bindPopup('You are here');

  // Telegram webviews often report the final viewport size only after the app
  // has rendered, leaving Leaflet with a 0-height canvas (a white screen). Nudge
  // it to re-measure once things settle and whenever Telegram resizes us.
  const fix = () => map.invalidateSize();
  setTimeout(fix, 200);
  setTimeout(fix, 600);
  if (tg && tg.onEvent) tg.onEvent('viewportChanged', fix);

  loadSpots();
}

function priceIcon(price) {
  return L.divIcon({
    className: 'price-icon',
    html: '<div class="price-pill">' + price + ' ETB</div>',
    iconSize: [60, 24],
    iconAnchor: [30, 24],
  });
}

function showCard(s) {
  cardEl.innerHTML =
    '<div class="card-head">' +
    '<div class="card-title">' + (s.address || 'Parking spot') + '</div>' +
    '<button class="card-close" id="cardClose">✕</button></div>' +
    '<div class="card-meta">' + s.price_per_hour + ' ETB/hr · ' + fmtDist(s.distance_m) +
    ' · ' + stars(s.rating_avg, s.rating_count) + '</div>' +
    '<div class="card-actions">' +
    '<button class="btn btn-primary" id="btnBook">📅 Book</button>' +
    '<button class="btn" id="btnDir">🧭 Directions</button></div>';
  cardEl.classList.remove('hidden');
  document.getElementById('cardClose').onclick = () => cardEl.classList.add('hidden');
  document.getElementById('btnBook').onclick = () => bookSpot(s);
  document.getElementById('btnDir').onclick = () => showDirections(s);
}

function bookSpot(s) {
  const url = 'https://t.me/' + bot + '?start=book_' + s.id;
  if (tg && tg.openTelegramLink) { tg.openTelegramLink(url); tg.close(); }
  else { window.open(url, '_blank'); }
}

async function showDirections(s) {
  // Draw an in-map route line (best-effort via OSRM)...
  try {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    const u = 'https://router.project-osrm.org/route/v1/driving/' +
      lng + ',' + lat + ';' + s.lng + ',' + s.lat + '?overview=full&geometries=geojson';
    const r = await fetch(u);
    const d = await r.json();
    if (d.routes && d.routes[0]) {
      const coords = d.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
      routeLayer = L.polyline(coords, { color: '#2563eb', weight: 5, opacity: 0.8 }).addTo(map);
      map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
    }
  } catch (e) {
    /* OSRM is best-effort; the Google Maps hand-off below always works. */
  }
  // ...and hand off to Google/native maps for actual turn-by-turn nav.
  const gmaps = directionsUrl(s.lat, s.lng);
  if (tg && tg.openLink) tg.openLink(gmaps);
  else window.open(gmaps, '_blank');
}

async function loadSpots() {
  try {
    const r = await fetch('/api/spots/nearby?lat=' + lat + '&lng=' + lng, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    const d = await r.json();
    if (!d.spots || !d.spots.length) { setStatus('No parking spots found nearby.'); return; }

    const bounds = [[lat, lng]];
    d.spots.forEach((s) => {
      const m = L.marker([s.lat, s.lng], { icon: priceIcon(s.price_per_hour) }).addTo(map);
      m.on('click', () => showCard(s));
      bounds.push([s.lat, s.lng]);
    });
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    setStatus(d.fallback ? 'Nearest spots (none within range)' : null);
    if (d.fallback) setTimeout(() => setStatus(null), 3000);
  } catch (e) {
    setStatus('Could not load spots. Check your connection.');
  }
}
