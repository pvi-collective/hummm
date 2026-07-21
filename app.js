/* hummm Build 001 — Haptic Compass
   Change only TARGET when preparing a new field test. */
const TARGET = { lat: -31.94915, lng: 115.85944 };
const ARRIVAL_RADIUS_METRES = 12;
const MAX_ARRIVAL_ACCURACY_METRES = 20;
const REQUIRED_ARRIVAL_READINGS = 2;
const MIN_DIRECTION_CHANGE_METRES = 4;
const DIRECTION_CHECK_INTERVAL_MS = 3500;

const app = document.querySelector('.app');
const message = document.querySelector('#message');
const startButton = document.querySelector('#start-button');
const retryButton = document.querySelector('#retry-button');

let watchId = null;
let filteredDistance = null;
let directionAnchorDistance = null;
let lastDirectionCheckAt = 0;
let lastHapticAt = 0;
let arrivalReadingCount = 0;
let guidanceTimer = null;
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
  navigator.vibrate([300, 100, 300]);
  startButton.textContent = 'pay attention';
  message.textContent = 'allow location access, then keep the phone on you.';
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
  // Gentle smoothing prevents a single noisy GPS reading changing the response.
  filteredDistance = filteredDistance === null ? rawDistance : filteredDistance * 0.65 + rawDistance * 0.35;

  if (filteredDistance <= ARRIVAL_RADIUS_METRES && accuracy <= MAX_ARRIVAL_ACCURACY_METRES) {
    arrivalReadingCount += 1;
    if (arrivalReadingCount >= REQUIRED_ARRIVAL_READINGS) {
      arrive();
      return;
    }
    setGuidance('almost there.');
  } else {
    arrivalReadingCount = 0;
  }

  playFieldRhythm();

  if (directionAnchorDistance === null) {
    directionAnchorDistance = filteredDistance;
    lastDirectionCheckAt = Date.now();
    setGuidance('move. pay attention.');
  } else {
    updateDirectionGuidance();
  }
}

function playFieldRhythm() {
  const now = Date.now();
  const rhythm = rhythmForDistance(filteredDistance);
  if (now - lastHapticAt < rhythm.interval) return;
  lastHapticAt = now;
  playPulses(rhythm.pulses);
}

function rhythmForDistance(distance) {
  if (distance > 400) return { pulses: 1, interval: 7000 };
  if (distance > 250) return { pulses: 1, interval: 5200 };
  if (distance > 150) return { pulses: 1, interval: 4000 };
  if (distance > 75) return { pulses: 2, interval: 3000 };
  if (distance > 35) return { pulses: 3, interval: 2200 };
  return { pulses: 4, interval: 1500 };
}

function updateDirectionGuidance() {
  const now = Date.now();
  if (now - lastDirectionCheckAt < DIRECTION_CHECK_INTERVAL_MS) return;

  const change = directionAnchorDistance - filteredDistance;
  if (change >= MIN_DIRECTION_CHANGE_METRES) {
    setGuidance('keep going.', true);
    directionAnchorDistance = filteredDistance;
  } else if (change <= -MIN_DIRECTION_CHANGE_METRES) {
    setGuidance('try another way.', true);
    directionAnchorDistance = filteredDistance;
  }
  lastDirectionCheckAt = now;
}

function setGuidance(text, returnToBase = false) {
  clearTimeout(guidanceTimer);
  message.textContent = text;
  if (returnToBase) {
    guidanceTimer = setTimeout(() => {
      message.textContent = 'move. pay attention.';
    }, 4500);
  }
}

function playPulses(count) {
  const pattern = [];
  for (let i = 0; i < count; i += 1) pattern.push(90, 110);
  navigator.vibrate?.(pattern);
  app.classList.add('pulsing');
  setTimeout(() => app.classList.remove('pulsing'), 300);
}

function arrive() {
  if (arrived) return;
  arrived = true;
  navigator.geolocation.clearWatch(watchId);
  navigator.vibrate?.([700]);
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
  clearTimeout(guidanceTimer);
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
