/* hummm — Redfern Field: data and GPS are evaluated locally in the browser. */
const DATA_URL = 'data/redfern-trees.geojson';
const INFLUENCE_RADIUS_METRES = 75;
const app = document.querySelector('#app');
const instruction = document.querySelector('#instruction');
const fieldValue = document.querySelector('#fieldValue');
const fieldHint = document.querySelector('#fieldHint');
const status = document.querySelector('#status');
const debug = document.querySelector('#debug');
const gpsPoint = document.querySelector('#gpsPoint');
const startButton = document.querySelector('#startButton');
const stopButton = document.querySelector('#stopButton');
const loader = document.querySelector('#loader');
const loaderText = document.querySelector('#loaderText');
let trees = [], audioContext = null, activeOscillators = [], fieldTimer = null, watchId = null, wakeLock = null, isWalking = false;
let field = { life: 0, maturity: 0, diversity: 0, nearby: 0 };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ageWeight = (age = '') => ({ Young: .35, 'Semi-Mature': .7, Mature: 1, Overmature: 1.25 }[age] || .6);

function getAudioContext() {
  if (!audioContext) { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return null; audioContext = new Audio(); }
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}
function distanceInMetres(latA, lonA, latB, lonB) {
  const r = Math.PI / 180, lat = (latB - latA) * r, lon = (lonB - lonA) * r;
  const a = Math.sin(lat / 2) ** 2 + Math.cos(latA * r) * Math.cos(latB * r) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function readField(latitude, longitude) {
  let canopy = 0, maturity = 0, nearby = 0; const species = new Set();
  trees.forEach((tree) => {
    const [lon, lat] = tree.geometry.coordinates;
    const distance = distanceInMetres(latitude, longitude, lat, lon);
    if (distance > INFLUENCE_RADIUS_METRES) return;
    const p = tree.properties, reach = Math.exp(-distance / 25), canopySize = clamp(Number(p.TreeCanopyNS) || 1, 1, 22);
    canopy += canopySize * reach;
    maturity += ageWeight(p.Tree_Age) * clamp((Number(p.DBH_in_cm) || 10) / 70, .12, 1.4) * reach;
    if (distance < 55 && p.SpeciesName) species.add(p.SpeciesName);
    nearby += 1;
  });
  return { life: clamp(Math.sqrt(canopy / 38), 0, 1), maturity: clamp(maturity / 3.3, 0, 1), diversity: clamp(species.size / 5, 0, 1), nearby };
}
function describeField(reading) {
  if (reading.life < .23) return ['concrete pressure', 'dense · electric · unsettled'];
  if (reading.life < .5) return ['threshold', 'a living rhythm is breaking through'];
  if (reading.life < .78) return ['living field', 'canopy gathers · the rhythm deepens'];
  return ['contact', 'the street answers in rhythm'];
}
function updateField(position) {
  field = readField(position.coords.latitude, position.coords.longitude);
  const [name, description] = describeField(field); fieldValue.textContent = name; fieldHint.textContent = description;
  app.classList.toggle('is-threshold', field.life >= .23 && field.life < .5); app.classList.toggle('is-living', field.life >= .5 && field.life < .78); app.classList.toggle('is-contact', field.life >= .78);
  status.textContent = `${field.nearby} trees within ${INFLUENCE_RADIUS_METRES}m`;
  gpsPoint.textContent = `gps point · ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)} · ±${Math.round(position.coords.accuracy)}m`;
  debug.textContent = `field ${Math.round(field.life * 100)} · maturity ${Math.round(field.maturity * 100)} · diversity ${Math.round(field.diversity * 100)}${wakeLock ? ' · screen awake' : ''}`;
}
function playPulse(context, { frequency, strength, offset, duration, type = 'sine' }) {
  const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + offset / 1000, end = start + duration / 1000;
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(strength, start + .018); gain.gain.exponentialRampToValueAtTime(.0001, end);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(end + .03); activeOscillators.push(oscillator);
  oscillator.addEventListener('ended', () => { activeOscillators = activeOscillators.filter((active) => active !== oscillator); }, { once: true });
}
function createConcretePattern(context, reading) {
  const base = 52 + Math.random() * 9, strength = .22 + (1 - reading.life) * .14;
  playPulse(context, { frequency: base, strength, offset: 0, duration: 90, type: 'triangle' });
  playPulse(context, { frequency: base + 7, strength: strength * .88, offset: 155 + Math.random() * 55, duration: 78, type: 'triangle' });
  if (reading.life < .12) playPulse(context, { frequency: base - 4, strength: strength * .62, offset: 440 + Math.random() * 90, duration: 55, type: 'sine' });
}
function createThresholdPattern(context, reading) {
  createConcretePattern(context, reading);
  playPulse(context, { frequency: 42, strength: .42 + reading.maturity * .12, offset: 690, duration: 210 });
  playPulse(context, { frequency: 46, strength: .28 + reading.diversity * .12, offset: 1020, duration: 125 });
}
function createLivingPattern(context, reading) {
  const strength = .48 + reading.life * .17, spacing = 300 + (1 - reading.diversity) * 80;
  playPulse(context, { frequency: 41 + reading.maturity * 3, strength, offset: 0, duration: 230 });
  playPulse(context, { frequency: 43 + reading.diversity * 4, strength: strength * .85, offset: spacing, duration: 175 });
  playPulse(context, { frequency: 39 + reading.maturity * 3, strength: strength * .74, offset: spacing * 2, duration: 250 });
}
function createContactPattern(context, reading) {
  const strength = .62 + reading.maturity * .14;
  playPulse(context, { frequency: 43, strength, offset: 0, duration: 210 });
  playPulse(context, { frequency: 46, strength: strength * .84, offset: 290, duration: 150 });
  playPulse(context, { frequency: 39, strength: strength * .92, offset: 720, duration: 330 });
  playPulse(context, { frequency: 44, strength: strength * .72, offset: 1220, duration: 190 });
}
function playFieldCycle() {
  const context = getAudioContext(); if (!context) return;
  if (field.life < .23) createConcretePattern(context, field);
  else if (field.life < .5) createThresholdPattern(context, field);
  else if (field.life < .78) createLivingPattern(context, field);
  else createContactPattern(context, field);
}
function scheduleFieldCycle() { if (!isWalking) return; playFieldCycle(); fieldTimer = window.setTimeout(scheduleFieldCycle, field.life >= .78 ? 1850 : 1500); }
function clearAudio() { window.clearTimeout(fieldTimer); fieldTimer = null; activeOscillators.forEach((oscillator) => { try { oscillator.stop(); } catch { /* already ended */ } }); activeOscillators = []; }
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch { wakeLock = null; }
}
async function releaseWakeLock() { if (wakeLock) { await wakeLock.release(); wakeLock = null; } }
function locationError(error) { isWalking = false; clearAudio(); releaseWakeLock(); startButton.disabled = false; startButton.textContent = 'try again'; stopButton.disabled = true; status.textContent = 'location unavailable'; gpsPoint.textContent = 'gps point · unavailable'; debug.textContent = error.code === 1 ? 'allow location access, then try again.' : 'move outside or wait for a clearer GPS signal.'; }
async function startField() {
  if (!navigator.geolocation) { status.textContent = 'location is unavailable in this browser'; return; }
  getAudioContext(); isWalking = true; startButton.disabled = true; startButton.textContent = 'reading the street'; stopButton.disabled = false; instruction.textContent = 'walk. let the rhythm pull you.'; app.classList.add('active'); status.textContent = 'finding your position'; gpsPoint.textContent = 'gps point · acquiring'; debug.textContent = 'allow location access to begin the field.';
  await requestWakeLock();
  watchId = navigator.geolocation.watchPosition(updateField, locationError, { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }); scheduleFieldCycle();
}
function stopField() { isWalking = false; clearAudio(); releaseWakeLock(); if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; app.classList.remove('active', 'is-threshold', 'is-living', 'is-contact'); startButton.disabled = false; startButton.textContent = 'begin field walk'; stopButton.disabled = true; instruction.textContent = 'let the street speak through the strap.'; fieldValue.textContent = 'waiting'; fieldHint.textContent = 'concrete is never silent.'; status.textContent = 'stopped'; gpsPoint.textContent = 'gps point · stopped'; debug.textContent = 'City of Sydney tree data · GPS stays on this device.'; }
document.addEventListener('visibilitychange', () => { if (isWalking && document.visibilityState === 'visible' && !wakeLock) requestWakeLock(); });
fetch(DATA_URL).then((response) => { if (!response.ok) throw new Error('Tree data could not load'); return response.json(); }).then((data) => {
  trees = data.features.filter((tree) => tree.geometry?.type === 'Point' && tree.properties?.Tree_Status === 'Tree');
  app.setAttribute('aria-busy', 'false'); loader.hidden = true; startButton.disabled = false; startButton.textContent = 'begin field walk'; status.textContent = `${trees.length} trees ready`;
}).catch(() => { app.setAttribute('aria-busy', 'false'); loaderText.textContent = 'field unavailable'; status.textContent = 'tree field could not load'; debug.textContent = 'check your connection, then reload.'; });
startButton.addEventListener('click', startField); stopButton.addEventListener('click', stopField);
