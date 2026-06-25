import { renderNearbyMap } from './src/utils/staticMap.js';

const testSpots = [
  { id: 1, lat: 9.01, lng: 38.83, address: 'Test Spot 1', price_per_hour: 20, distance_m: 100 },
  { id: 2, lat: 9.02, lng: 38.84, address: 'Test Spot 2', price_per_hour: 30, distance_m: 500 },
];

console.log('Testing map rendering...');
try {
  const buffer = await renderNearbyMap({
    lat: 9.013,
    lng: 38.837,
    spots: testSpots
  });
  console.log('✅ Map rendered successfully!');
  console.log('Buffer size:', buffer.length, 'bytes');
  process.exit(0);
} catch (err) {
  console.error('❌ Map rendering failed:', err.message);
  console.error(err.stack);
  process.exit(1);
}
