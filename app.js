/*
  hummm — Build 002: The Calling

  Research question:
  Can a living haptic language both guide and move a human wayfinder?

  Design principles:
  Human Wayfinding · Trust before autonomy · Rhythm is language ·
  Silence is productive · Places express themselves ·
  Wayfinders respond through movement · Arrival is joy not achievement.

  The phrase engine is deliberately hardware-agnostic. Replace the
  phoneOutput implementation with a Woojer/BLE or audio output later;
  the GPS and phrase logic do not need to change.
*/

const TARGET = { lat: -31.95022, lng: 115.86051 };
const ARRIVAL_RADIUS_METRES = 10;
const UPDATE_MS = 1000;
const MIN_MOVEMENT_METRES = 3;

const PHRASES = Object.freeze({
  Awakening: {
    pattern: [90, 140, 90, 2600],
    text: 'something is near'
  },

  Invitation: {
    pattern: [110, 130, 110, 1500, 110, 2200],
    text: 'come find me'
  },

  Curiosity: {
    pattern: [120, 100, 120, 130, 120, 1200],
    text: 'notice what changes and adapt'
  },

  Uncertainty: {
    pattern: [180, 1800],
    text: 'if you feel nothing, find another way'
  },

  Distress: {
    pattern: [100, 70, 100, 70, 150, 90, 100, 70, 180, 360],
    text: 'please don\'t leave, you are so close'
  },

  Relief: {
    pattern: [700],
    text: 'you have arrived'
  }
});

const app = document.querySelector('#app');
const startButton = document.querySelector('#startButton');
const instruction = document.querySelector('#instruction');
const status = document.querySelector('#status');
const debug = document.querySelector('#debug');

let watchId = null;
let timerId = null;
let lastPosition = null;
let lastDistance = null;
let currentPhrase = null;
let arrived = false;

// Output adapter: this is the only layer that knows about navigator.vibrate.
const phoneOutput = {
  supported: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
  play(pattern) {
    if (!this.supported) return false;
    return navigator.vibrate(pattern);
  },
  stop() {
    if (this.supported) navigator.vibrate(0);
  }
};

let output = phoneOutput;

// Hardware-agnostic entry point. A Woojer adapter can replace `output` later.
function playPhrase(name) {
  const phrase = PHRASES[name];
  if (!phrase) return;
  if (name === 'Uncertainty' && currentPhrase === 'Uncertainty') return;
  if (name === currentPhrase && name !== 'Distress') return;
  output.stop();
  output.play(phrase.pattern);
  currentPhrase = name;
  app.classList.toggle('distress', name === 'Distress');
  instruction.textContent = phrase.text;
const zoneNames = {
  Awakening: 'zone 1. awakening',
  Invitation: 'zone 2. invitation',
  Curiosity: 'zone 3. curiosity',
  Uncertainty: 'zone 4. uncertainty',
  Distress: 'zone 5. distress',
  Relief: 'zone 6. relief'
};

status.textContent = zoneNames[name];
}

function silence() {
  output.stop();
  currentPhrase = null;
  app.classList.remove('distress');
  instruction.textContent = 'pay attention.';
  status.textContent = 'quiet';
}

function distanceBetween(a, b) {
  const earth = 6371000;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

function choosePhrase(distance, movingCloser) {
  if (distance <= ARRIVAL_RADIUS_METRES) return 'Relief';
  // Silence is deliberate when a wayfinder is moving away.
  if (lastDistance !== null && distance > lastDistance + MIN_MOVEMENT_METRES) return null;
  if (!movingCloser && distance > 100) return 'Uncertainty';
  if (distance > 500) return 'Awakening';
  if (distance > 250) return 'Invitation';
  if (distance > 100) return 'Curiosity';
  return 'Distress';
}

function handlePosition(position) {
  const point = { lat: position.coords.latitude, lng: position.coords.longitude };
  const distance = distanceBetween(point, TARGET);
  const movingCloser = lastDistance === null || distance < lastDistance - MIN_MOVEMENT_METRES;
  const phrase = choosePhrase(distance, movingCloser);

  if (distance <= ARRIVAL_RADIUS_METRES) {
    if (!arrived) {
      arrived = true;
      playPhrase('Relief');
      app.classList.add('arrived');
      instruction.textContent = PHRASES.Relief.text;
      stopTracking();
    }
  } else if (!arrived) {
    if (phrase) playPhrase(phrase); else silence();
  }

  debug.textContent = `lat ${point.lat.toFixed(6)} · lng ${point.lng.toFixed(6)}\n` +
    `distance ${Math.round(distance)} m · accuracy ${Math.round(position.coords.accuracy)} m\n` +
    `phrase ${phrase || 'silence'} · vibration ${output.supported ? 'available' : 'unavailable'}`;
  lastPosition = point;
  lastDistance = distance;
}

function handleError(error) {
  status.textContent = `location unavailable (${error.code})`;
  instruction.textContent = 'allow location, then try again.';
  stopTracking();
}

function stopTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (timerId !== null) window.clearInterval(timerId);
  watchId = null;
  timerId = null;
}

function start() {
  if (!navigator.geolocation) {
    instruction.textContent = 'location is not available in this browser.';
    return;
  }
  startButton.textContent = 'explore';
startButton.disabled = true;
  app.classList.add('active');
  instruction.textContent = 'move slowly. pay attention.';
  status.textContent = 'finding your position…';
  debug.hidden = false;
  // Immediate tactile acknowledgement makes it clear that the app is alive.
  output.play([80]);
  watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
    enableHighAccuracy: true, maximumAge: 5000, timeout: 15000
  });
  timerId = window.setInterval(() => {
    if (!lastPosition && !arrived) status.textContent = 'waiting for GPS…';
  }, UPDATE_MS);
}

startButton.addEventListener('click', start);
