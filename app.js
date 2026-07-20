/* hummm Build 001 — Haptic Compass
   Change only TARGET when preparing a new field test. */
const TARGET = { lat: -31.94915, lng: 115.85944 };
const ARRIVAL_RADIUS_METRES = 12;
const MIN_MEANINGFUL_CHANGE_METRES = 5;
const FEEDBACK_INTERVAL_MS = 2600;

const app = document.querySelector('.app');
const message = document.querySelector('#message');
const startButton = document.querySelector('#start-button');
const retryButton = document.querySelector('#retry-button');

let watchId = null;
let filteredDistance = null;
let referenceDistance = null;
let lastFeedbackAt = 0;
let arrived = false;

startButton.addEventListener('click', begin);
retryButton.addEventListener('click', reset);

function begin() {
  if (!window.isSecureContext) {
    showProblem('This build needs to be opened from the hummm GitHub Pages address, not from a downloaded file.');
    return;
  }
  if (!('geolocation' in navigator)) {
    showProblem('This phone does not offer location services in its browser.');
    return;
  }

  startButton.disabled = true;
  startButton.textContent = 'Listening…';
  message.textContent = 'Allow location access, then put the phone in your pocket.';
  app.classList.add('listening');
  watchId = navigator.geolocation.watchPosition(onPosition, onLocationProblem, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 15000
  });
}

function onPosition(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const rawDistance = distanceBetween(latitude, longitude, TARGET.lat, TARGET.lng);
  // Gentle smoothing prevents a single noisy GPS reading changing the message.
  filteredDistance = filteredDistance === null ? rawDistance : filteredDistance * 0.65 + rawDistance * 0.35;

  if (filteredDistance <= Math.max(ARRIVAL_RADIUS_METRES, accuracy)) {
    arrive();
    return;
  }

  if (referenceDistance === null) {
    referenceDistance = filteredDistance;
    message.textContent = 'move. listen. look.';
    return;
  }

  const now = Date.now();
  if (now - lastFeedbackAt < FEEDBACK_INTERVAL_MS) return;
  lastFeedbackAt = now;

  const progress = referenceDistance - filteredDistance;
  if (progress >= MIN_MEANINGFUL_CHANGE_METRES) {
    const pulses = pulseCount(filteredDistance, progress);
    playPulses(pulses);
    message.textContent = 'keep going.';
    referenceDistance = filteredDistance;
  } else if (progress <= -MIN_MEANINGFUL_CHANGE_METRES) {
    // silence is deliberate: the last movement did not bring the participant closer.
    message.textContent = 'listen. try another way.';
    referenceDistance = filteredDistance;
  }
}

function pulseCount(distance, progress) {
  if (distance < 45 || progress > 30) return 4;
  if (distance < 120 || progress > 15) return 3;
  if (distance < 300 || progress > 8) return 2;
  return 1;
}

function playPulses(count) {
  const pattern = [];
  for (let i = 0; i < count; i += 1) pattern.push(115, 130);
  navigator.vibrate?.(pattern);
  app.classList.add('pulsing');
  setTimeout(() => app.classList.remove('pulsing'), 300);
}

function arrive() {
  if (arrived) return;
  arrived = true;
  navigator.geolocation.clearWatch(watchId);
  navigator.vibrate?.([500]);
  app.classList.remove('listening');
  app.classList.add('arrived');
  message.textContent = 'you have arrived. stay here.';
  startButton.classList.add('hidden');
  retryButton.classList.remove('hidden');
}

function onLocationProblem(error) {
  const problems = {
    1: 'Location access was not allowed. Please allow it in your browser settings and try again.',
    2: 'Your location is unavailable right now. Move outside or try again shortly.',
    3: 'Location took too long. Move outside or try again shortly.'
  };
  showProblem(problems[error.code] || 'Location could not be read. Please try again.');
}

function showProblem(text) {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  message.textContent = text;
  startButton.classList.add('hidden');
  retryButton.classList.remove('hidden');
}

function reset() {
  window.location.reload();
}

function distanceBetween(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const earthRadius = 6371000;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
