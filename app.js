/* hummm — Perth Cultural Centre Field: tree data and GPS stay local in the browser. */
const DATA_URL = 'data/perth-cultural-centre-trees.geojson';
const INFLUENCE_RADIUS_METRES = 90;
const CONTACT_RADIUS_METRES = 15;
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
let field = { life: 0, maturity: 0, diversity: 0, nearby: 0, nearest: null, canopy: 0 };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const treeHeight = (tree) => clamp(Number(tree.properties?.TREE_HEIGHT) || 8, 3, 30);
const canopyRadius = (tree) => clamp(treeHeight(tree) * .42, 2.5, 13);

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
  let canopy = 0, maturity = 0, nearby = 0, nearest = null; const species = new Set();
  trees.forEach((tree) => {
    const [lon, lat] = tree.geometry.coordinates;
    const distance = distanceInMetres(latitude, longitude, lat, lon);
    if (distance > INFLUENCE_RADIUS_METRES) return;
    const p = tree.properties, radius = canopyRadius(tree), reach = Math.exp(-distance / (18 + radius * 1.5));
    canopy += radius * reach;
    maturity += clamp(treeHeight(tree) / 20, .18, 1.35) * reach;
    if (distance < 65 && (p.BOTANICAL_NAME || p.COMMON_NAME)) species.add(p.BOTANICAL_NAME || p.COMMON_NAME);
    nearby += 1;
    if (!nearest || distance < nearest.distance) nearest = { distance, tree, radius };
  });
  return { life: clamp(Math.sqrt(canopy / 42), 0, 1), maturity: clamp(maturity / 4.5, 0, 1), diversity: clamp(species.size / 5, 0, 1), nearby, nearest, canopy: clamp(canopy / 42, 0, 1) };
}
function describeField(reading) {
  if (!reading.nearest || reading.life < .2) return ['concrete bed', 'sparse · low · uneasy'];
  if (reading.nearest.distance > 15 || reading.life < .48) return ['disturbance', 'something living is entering the field'];
  if (reading.nearest.distance > 5 || reading.life < .78) return ['cascading field', 'pulses gather · the tree enters the body'];
  return ['contact', 'hold the rhythm · several lives overlap'];
}
function showConcreteBaseline() {
  field = { life: 0, maturity: 0, diversity: 0, nearby: 0, nearest: null, canopy: 0 };
  fieldValue.textContent = 'concrete bed'; fieldHint.textContent = 'sparse · low · uneasy';
  app.classList.remove('is-threshold', 'is-living', 'is-contact');
  status.textContent = 'concrete signal active · finding position';
  gpsPoint.textContent = 'gps point · acquiring';
  debug.textContent = 'field 0 · maturity 0 · diversity 0 · GPS waiting';
}
function updateField(position) {
  field = readField(position.coords.latitude, position.coords.longitude);
  const [name, description] = describeField(field); fieldValue.textContent = name; fieldHint.textContent = description;
  app.classList.toggle('is-threshold', field.life >= .23 && field.life < .5); app.classList.toggle('is-living', field.life >= .5 && field.life < .78); app.classList.toggle('is-contact', field.life >= .78);
  const nearestText = field.nearest ? ` · nearest ${Math.round(field.nearest.distance)}m` : '';
  status.textContent = `${field.nearby} trees within ${INFLUENCE_RADIUS_METRES}m${nearestText}`;
  gpsPoint.textContent = `gps point · ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)} · ±${Math.round(position.coords.accuracy)}m`;
  debug.textContent = `field ${Math.round(field.life * 100)} · maturity ${Math.round(field.maturity * 100)} · diversity ${Math.round(field.diversity * 100)} · GPS ±${Math.round(position.coords.accuracy)}m${wakeLock ? ' · screen awake' : ''}`;
}
function playPulse(context, { frequency, strength, offset, duration, type = 'sine' }) {
  const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + offset / 1000, end = start + duration / 1000;
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(strength, start + .018); gain.gain.exponentialRampToValueAtTime(.0001, end);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(end + .03); activeOscillators.push(oscillator);
  oscillator.addEventListener('ended', () => { activeOscillators = activeOscillators.filter((active) => active !== oscillator); }, { once: true });
}
function createConcretePattern(context, reading) {
  const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime;
  const strength = .34 + (1 - reading.life) * .14, end = start + 1.55;
  oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(47 + Math.random() * 4, start);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(strength, start + .05);
  gain.gain.linearRampToValueAtTime(strength * .84, start + .52);
  gain.gain.linearRampToValueAtTime(strength * 1.02, start + 1.04);
  gain.gain.linearRampToValueAtTime(.0001, end);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(end + .03); activeOscillators.push(oscillator);
  oscillator.addEventListener('ended', () => { activeOscillators = activeOscillators.filter((active) => active !== oscillator); }, { once: true });
}
function createThresholdPattern(context, reading) {
  createConcretePattern(context, reading);
  const approach = reading.nearest ? clamp(1 - reading.nearest.distance / INFLUENCE_RADIUS_METRES, 0, 1) : 0;
  playPulse(context, { frequency: 40 + approach * 5, strength: .34 + reading.maturity * .18, offset: 520, duration: 170 });
  playPulse(context, { frequency: 45 + reading.diversity * 4, strength: .25 + approach * .2, offset: 850 + Math.random() * 130, duration: 120 });
}
function createLivingPattern(context, reading) {
  const strength = .42 + reading.life * .28, spacing = 220 + (1 - reading.diversity) * 110;
  playPulse(context, { frequency: 39 + reading.maturity * 4, strength, offset: 0, duration: 210 });
  playPulse(context, { frequency: 43 + reading.diversity * 5, strength: strength * .82, offset: spacing + Math.random() * 90, duration: 150 });
  playPulse(context, { frequency: 37 + reading.maturity * 5, strength: strength * .72, offset: spacing * 2 + Math.random() * 120, duration: 240 });
  if (reading.nearby > 2) playPulse(context, { frequency: 48, strength: strength * .55, offset: spacing * 2.8, duration: 120 });
}
function createContactPattern(context, reading) {
  const strength = .56 + reading.maturity * .2, density = clamp(reading.nearby / 5, 0, 1);
  playPulse(context, { frequency: 40, strength, offset: 0, duration: 250 });
  playPulse(context, { frequency: 46, strength: strength * .82, offset: 260 + Math.random() * 90, duration: 170 });
  playPulse(context, { frequency: 37, strength: strength * .9, offset: 600 + Math.random() * 160, duration: 330 });
  playPulse(context, { frequency: 44 + density * 5, strength: strength * .72, offset: 1010 + Math.random() * 180, duration: 190 });
  playPulse(context, { frequency: 49, strength: strength * (.35 + density * .3), offset: 1380 + Math.random() * 220, duration: 140 });
}
function playFieldCycle() {
  const context = getAudioContext(); if (!context) return;
  if (field.life < .23) createConcretePattern(context, field);
  else if (field.life < .5) createThresholdPattern(context, field);
  else if (field.life < .78) createLivingPattern(context, field);
  else createContactPattern(context, field);
}
function scheduleFieldCycle() { if (!isWalking) return; playFieldCycle(); fieldTimer = window.setTimeout(scheduleFieldCycle, field.nearest && field.nearest.distance <= CONTACT_RADIUS_METRES ? 2600 : 1450); }
function clearAudio() { window.clearTimeout(fieldTimer); fieldTimer = null; activeOscillators.forEach((oscillator) => { try { oscillator.stop(); } catch { /* already ended */ } }); activeOscillators = []; }
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch { wakeLock = null; }
}
async function releaseWakeLock() { if (wakeLock) { await wakeLock.release(); wakeLock = null; } }
function locationError(error) { isWalking = false; clearAudio(); releaseWakeLock(); startButton.disabled = false; startButton.textContent = 'try again'; stopButton.disabled = true; status.textContent = 'location unavailable'; gpsPoint.textContent = 'gps point · unavailable'; debug.textContent = error.code === 1 ? 'allow location access, then try again.' : 'move outside or wait for a clearer GPS signal.'; }
function locationProbeError(error) {
  if (error.code === 1) locationError(error);
  else if (isWalking) debug.textContent = 'field 0 · maturity 0 · diversity 0 · GPS still searching';
}
function startField() {
  if (!navigator.geolocation) { status.textContent = 'location is unavailable in this browser'; return; }
  isWalking = true; startButton.disabled = true; startButton.textContent = 'reading the street'; stopButton.disabled = false; instruction.textContent = 'walk. let the rhythm pull you.'; app.classList.add('active'); showConcreteBaseline();
  try { getAudioContext(); scheduleFieldCycle(); } catch { status.textContent = 'audio could not begin'; }
  const locationOptions = { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 };
  try {
    watchId = navigator.geolocation.watchPosition(updateField, locationError, locationOptions);
    navigator.geolocation.getCurrentPosition(updateField, locationProbeError, locationOptions);
  } catch { locationError({ code: 0 }); }
  requestWakeLock();
}
function stopField() { isWalking = false; clearAudio(); releaseWakeLock(); if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; app.classList.remove('active', 'is-threshold', 'is-living', 'is-contact'); startButton.disabled = false; startButton.textContent = 'begin field walk'; stopButton.disabled = true; instruction.textContent = 'let the street speak through the strap.'; fieldValue.textContent = 'waiting'; fieldHint.textContent = 'concrete is never silent.'; status.textContent = 'stopped'; gpsPoint.textContent = 'gps point · stopped'; debug.textContent = 'City of Perth tree data · GPS stays on this device.'; }
document.addEventListener('visibilitychange', () => { if (isWalking && document.visibilityState === 'visible' && !wakeLock) requestWakeLock(); });
fetch(DATA_URL).then((response) => { if (!response.ok) throw new Error('Tree data could not load'); return response.json(); }).then((data) => {
  trees = data.features.filter((tree) => tree.geometry?.type === 'Point' && tree.properties?.RETIRED !== 'Yes');
  app.setAttribute('aria-busy', 'false'); loader.hidden = true; startButton.disabled = false; startButton.textContent = 'begin field walk'; status.textContent = `${trees.length} Perth trees ready`;
}).catch(() => { app.setAttribute('aria-busy', 'false'); loaderText.textContent = 'field unavailable'; status.textContent = 'tree field could not load'; debug.textContent = 'check your connection, then reload.'; });
startButton.addEventListener('click', startField); stopButton.addEventListener('click', stopField);
