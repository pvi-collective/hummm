/*
  hummm — Build 003: The Calling

  Research question:
  Can a living haptic language both guide and move a human wayfinder?

  Design principles:
  Human Wayfinding · Trust before autonomy · Rhythm is language ·
  Silence is productive · Places express themselves ·
  Wayfinders respond through movement · Arrival is joy not achievement.
*/

const TARGET = {
  lat: -31.950943442782748,
  lng: 115.86049607250894
};

const ARRIVAL_RADIUS_METRES = 15;
const UPDATE_MS = 1000;
const MIN_MOVEMENT_METRES = 3;

/*
  Each zone contains its territory, language and heartbeat.
  Patterns alternate: vibration, pause, vibration, pause...
*/
const ZONES = Object.freeze([
  {
    name: 'Awakening',
    min: 91,
    max: Infinity,
    label: 'zone 1. awakening',
    text: 'i am not far',
    pattern: [120, 1100]
  },
  {
    name: 'Invitation',
    min: 86,
    max: 90,
    label: 'zone 2. invitation',
    text: 'come closer',
    pattern: [100, 100, 100, 900]
  },
  {
    name: 'Curiosity',
    min: 76,
    max: 85,
    label: 'zone 3. curiosity',
    text: 'pay attention',
    pattern: [90, 110, 90, 110, 90, 750]
  },
  {
    name: 'Ease',
    min: 66,
    max: 75,
    label: 'zone 4. ease',
    text: 'trust movement',
    pattern: [100, 300, 100, 650]
  },
  {
    name: 'Purpose',
    min: 56,
    max: 65,
    label: 'zone 5. purpose',
    text: 'keep moving',
    pattern: [100, 160, 100, 160, 100, 500]
  },
  {
    name: 'Deeper',
    min: 46,
    max: 55,
    label: 'zone 6. deeper',
    text: 'go deeper',
    pattern: [90, 110, 90, 110, 90, 110, 130, 400]
  },
  {
    name: 'Concern',
    min: 36,
    max: 45,
    label: 'zone 7. concern',
    text: 'stay close',
    pattern: [140, 80, 90, 170, 160, 350]
  },
  {
    name: 'Urgency',
    min: 26,
    max: 35,
    label: 'zone 8. urgency',
    text: 'almost there',
    pattern: [90, 70, 90, 70, 90, 70, 90, 280]
  },
  {
    name: 'Distress',
    min: 16,
    max: 25,
    label: 'zone 9. distress',
    text: "don't leave",
    pattern: [120, 40, 120, 40, 120, 40, 120, 40, 120, 180]
  },
  {
    name: 'Relief',
    min: 0,
    max: 15,
    label: 'zone 10. relief',
    text: 'you have arrived',
    pattern: [800],
    repeat: false
  }
]);

const UNCERTAINTY = Object.freeze({
  name: 'Uncertainty',
  label: 'uncertainty',
  text: 'find another way'
});

const app = document.querySelector('#app');
const startButton = document.querySelector('#startButton');
const instruction = document.querySelector('#instruction');
const status = document.querySelector('#status');
const debug = document.querySelector('#debug');
const distanceDisplay = document.querySelector('#distanceDisplay');

let watchId = null;
let timerId = null;
let phraseTimerId = null;
let lastPosition = null;
let lastDistance = null;
let currentState = null;
let arrived = false;

// This is the only part that knows about the phone vibration motor.
// A Woojer or BLE haptic adapter can replace this later.
const phoneOutput = {
  supported: typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function',

  play(pattern) {
    if (!this.supported) return false;
    return navigator.vibrate(pattern);
  },

  stop() {
    if (this.supported) navigator.vibrate(0);
  }
};

let output = phoneOutput;

function patternDuration(pattern) {
  return pattern.reduce((total, duration) => total + duration, 0);
}

function clearPhraseLoop() {
  if (phraseTimerId !== null) {
    window.clearTimeout(phraseTimerId);
    phraseTimerId = null;
  }
}

function findZone(distance) {
  return ZONES.find((zone) =>
    distance >= zone.min && distance <= zone.max
  );
}

function isMovingAway(distance) {
  return (
    lastDistance !== null &&
    distance > lastDistance + MIN_MOVEMENT_METRES
  );
}

function updateInterface(state) {
  instruction.textContent = state.text;
  status.textContent = state.label;
  app.classList.toggle('distress', state.name === 'Distress');
}

function playZone(zone) {
  clearPhraseLoop();
  output.stop();

  currentState = zone.name;
  updateInterface(zone);
  output.play(zone.pattern);

  if (zone.repeat === false) return;

  const repeat = () => {
    if (arrived || currentState !== zone.name) return;

    output.play(zone.pattern);

    phraseTimerId = window.setTimeout(
      repeat,
      patternDuration(zone.pattern)
    );
  };

  phraseTimerId = window.setTimeout(
    repeat,
    patternDuration(zone.pattern)
  );
}

function enterZone(zone) {
  if (currentState === zone.name) return;
  playZone(zone);
}

function enterUncertainty() {
  if (currentState === UNCERTAINTY.name) return;

  clearPhraseLoop();
  output.stop();

  currentState = UNCERTAINTY.name;
  updateInterface(UNCERTAINTY);
}

function distanceBetween(a, b) {
  const earth = 6371000;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLon / 2) ** 2;

  return 2 * earth * Math.asin(Math.sqrt(h));
}

function handlePosition(position) {
  const point = {
    lat: position.coords.latitude,
    lng: position.coords.longitude
  };

  const distance = distanceBetween(point, TARGET);

  if (distanceDisplay) {
    distanceDisplay.textContent = Math.round(distance);
  }

  const movingAway = isMovingAway(distance);
  const nextZone = findZone(distance);

  if (distance <= ARRIVAL_RADIUS_METRES) {
    if (!arrived) {
      arrived = true;
      playZone(nextZone);
      app.classList.add('arrived');
      stopTracking();
    }
  } else if (movingAway) {
    enterUncertainty();
  } else if (nextZone) {
    enterZone(nextZone);
  }

  debug.innerHTML = `
lat ${point.lat.toFixed(6)} · lng ${point.lng.toFixed(6)}<br>
distance ${Math.round(distance)} m · accuracy ±${Math.round(position.coords.accuracy)} m<br>
state ${currentState || 'none'} · next ${movingAway ? 'uncertainty' : nextZone.name}
`;

  lastPosition = point;
  lastDistance = distance;
}

function handleError(error) {
  clearPhraseLoop();
  output.stop();

  status.textContent = `location unavailable (${error.code})`;
  instruction.textContent = 'allow location, then try again.';

  startButton.disabled = false;
  startButton.textContent = 'begin';

  stopTracking();
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }

  if (timerId !== null) {
    window.clearInterval(timerId);
  }

  watchId = null;
  timerId = null;
}

function start() {
  if (!navigator.geolocation) {
    instruction.textContent = 'location is not available in this browser.';
    return;
  }

  arrived = false;
  lastPosition = null;
  lastDistance = null;
  currentState = null;

  startButton.textContent = 'explore';
  startButton.disabled = true;

  app.classList.remove('arrived', 'distress');
  app.classList.add('active');

  instruction.textContent = 'move slowly. pay attention.';
  status.textContent = 'finding your position…';
  debug.hidden = false;

  if (distanceDisplay) {
    distanceDisplay.textContent = '…';
  }

  output.play([80]);

  watchId = navigator.geolocation.watchPosition(
    handlePosition,
    handleError,
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    }
  );

  timerId = window.setInterval(() => {
    if (!lastPosition && !arrived) {
      status.textContent = 'waiting for GPS…';
    }
  }, UPDATE_MS);
}

startButton.addEventListener('click', start);
