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
let currentTileLayer = null;
let baseLayers = {};

if (!isFinite(lat) || !isFinite(lng)) {
  setStatus('Location missing. Open this from the bot after sharing your location.');
} else {
  startMap();
}

function startMap() {
  map = L.map('map', { 
    zoomControl: false,
    attributionControl: true 
  }).setView([lat, lng], 15);
  
  // Add zoom control to top-right
  L.control.zoom({ position: 'topright' }).addTo(map);
  
  // Define multiple tile layers (like Google Maps)
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  });
  
  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: '© Esri',
  });
  
  const terrainLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '© OpenTopoMap',
  });
  
  const streetsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '© CARTO',
  });
  
  // Default to OSM
  osmLayer.addTo(map);
  currentTileLayer = osmLayer;
  
  // Base layers for control
  baseLayers = {
    '🗺️ Map': osmLayer,
    '🛰️ Satellite': satelliteLayer,
    '⛰️ Terrain': terrainLayer,
    ' Streets': streetsLayer,
  };
  
  // Add layer control (top-left)
  L.control.layers(baseLayers, null, { 
    position: 'topleft',
    collapsed: true 
  }).addTo(map);
  
  // Handle tile loading errors
  currentTileLayer.on('tileerror', function(error) {
    console.warn('Tile loading error:', error);
  });

  const meIcon = L.divIcon({ className: 'me-icon', html: '<div class="me-dot"></div>', iconSize: [16, 16] });
  L.marker([lat, lng], { icon: meIcon }).addTo(map).bindPopup('You are here');

  // Telegram webviews often report the final viewport size only after the app
  // has rendered, leaving Leaflet with a 0-height canvas (a white screen). Nudge
  // it to re-measure once things settle and whenever Telegram resizes us.
  const fix = () => map.invalidateSize();
  setTimeout(fix, 200);
  setTimeout(fix, 600);
  setTimeout(fix, 1200); // Extra fix for slower connections
  if (tg && tg.onEvent) tg.onEvent('viewportChanged', fix);

  loadSpots();
}

function priceIcon(price) {
  // Google Maps-style teardrop pin in green
  return L.divIcon({
    className: 'custom-pin',
    html: `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 11.3 15 27 15 27s15-15.7 15-27C30 6.7 23.3 0 15 0z" fill="#16a34a" stroke="#fff" stroke-width="2"/>
      <circle cx="15" cy="15" r="6" fill="#fff"/>
    </svg>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42], // Point is at bottom center
    popupAnchor: [0, -42],
    className: 'custom-pin'
  });
}

function showCard(s) {
  cardEl.innerHTML =
    '<div class="card-head">' +
    '<div class="card-title">' + (s.address || 'Parking spot') + '</div>' +
    '<button class="card-close" id="cardClose"></button></div>' +
    '<div class="card-price">' + s.price_per_hour + ' ETB/hr</div>' +
    '<div class="card-meta">' + fmtDist(s.distance_m) +
    ' · ' + stars(s.rating_avg, s.rating_count) + '</div>' +
    '<div class="card-actions">' +
    '<button class="btn btn-primary" id="btnBook">📅 Book Now</button>' +
    '<button class="btn" id="btnDir"> Directions</button></div>';
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
  // Clear existing route
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
  
  // Show loading status
  setStatus('Calculating route...');
  
  try {
    // Fetch route from OSRM
    const u = 'https://router.project-osrm.org/route/v1/driving/' +
      lng + ',' + lat + ';' + s.lng + ',' + s.lat + '?overview=full&geometries=geojson&steps=true';
    const r = await fetch(u);
    const d = await r.json();
    
    if (d.routes && d.routes[0]) {
      const route = d.routes[0];
      const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
      
      // Draw route on map
      routeLayer = L.polyline(coords, { 
        color: '#2563eb', 
        weight: 6, 
        opacity: 0.9,
        lineJoin: 'round'
      }).addTo(map);
      
      // Add start and end markers
      const startIcon = L.divIcon({
        className: 'route-marker',
        html: '<div style="background:#2563eb;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      
      const endIcon = L.divIcon({
        className: 'route-marker',
        html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      
      L.marker([lat, lng], { icon: startIcon }).addTo(map).bindPopup('Start');
      L.marker([s.lat, s.lng], { icon: endIcon }).addTo(map).bindPopup('Destination');
      
      // Fit map to show entire route
      map.fitBounds(routeLayer.getBounds(), { padding: [60, 60], maxZoom: 16 });
      
      // Show route info
      const distance = (route.distance / 1000).toFixed(1);
      const duration = Math.round(route.duration / 60);
      setStatus(`${distance} km · ${duration} min`);
      
      // Update card with route info
      const cardMeta = cardEl.querySelector('.card-meta');
      if (cardMeta) {
        cardMeta.innerHTML = `🚗 ${distance} km · ${duration} min · ` + stars(s.rating_avg, s.rating_count);
      }
      
      // Add "Open in Google Maps" option
      const cardActions = cardEl.querySelector('.card-actions');
      if (cardActions) {
        const gmapsBtn = document.createElement('button');
        gmapsBtn.className = 'btn';
        gmapsBtn.innerHTML = '🌐 Google Maps';
        gmapsBtn.onclick = () => {
          const gmaps = directionsUrl(s.lat, s.lng);
          if (tg && tg.openLink) tg.openLink(gmaps);
          else window.open(gmaps, '_blank');
        };
        cardActions.appendChild(gmapsBtn);
      }
      
      setTimeout(() => setStatus(null), 5000);
    } else {
      setStatus('Could not calculate route');
    }
  } catch (e) {
    console.error('Route error:', e);
    setStatus('Route calculation failed');
    setTimeout(() => setStatus(null), 3000);
  }
}

async function loadSpots() {
  try {
    setStatus('Loading spots...');
    const r = await fetch('/api/spots/nearby?lat=' + lat + '&lng=' + lng, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    const d = await r.json();
    
    if (!d.spots || !d.spots.length) { 
      setStatus('No parking spots found nearby.'); 
      return; 
    }

    setStatus(null); // Clear loading message
    const bounds = [[lat, lng]];
    let spotsAdded = 0;
    
    d.spots.forEach((s) => {
      if (s.lat && s.lng) {
        const marker = L.marker([s.lat, s.lng], { icon: priceIcon(s.price_per_hour) }).addTo(map);
        
        // Make pins tappable
        marker.on('click', function() {
          console.log('Spot clicked:', s);
          showCard(s);
        });
        
        bounds.push([s.lat, s.lng]);
        spotsAdded++;
      }
    });
    
    if (spotsAdded > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      setStatus('Tap a pin to view details');
      setTimeout(() => setStatus(null), 3000);
    } else {
      setStatus('No spots with valid coordinates');
    }
    
    if (d.fallback) {
      setTimeout(() => {
        setStatus('Nearest spots (none within range)');
        setTimeout(() => setStatus(null), 3000);
      }, 3000);
    }
  } catch (e) {
    console.error('Failed to load spots:', e);
    setStatus('Could not load spots. Check your connection.');
  }
}
