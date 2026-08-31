/* hummm — Redfern Field: data and GPS are evaluated locally in the browser. */
const DATA_URL = 'data/redfern-trees.geojson';
const INFLUENCE_RADIUS_METRES = 90;
const app = document.querySelector('#app');
const instruction = document.querySelector('#instruction');
const fieldValue = document.querySelector('#fieldValue');
const fieldHint = document.querySelector('#fieldHint');
const status = document.querySelector('#status');
const debug = document.querySelector('#debug');
const startButton = document.querySelector('#startButton');
const stopButton = document.querySelector('#stopButton');
let trees = [], audioContext = null, activeOscillators = [], fieldTimer = null, watchId = null, isWalking = false;
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
    const p = tree.properties, reach = Math.exp(-distance / 30), canopySize = clamp(Number(p.TreeCanopyNS) || 1, 1, 22);
    canopy += canopySize * reach;
    maturity += ageWeight(p.Tree_Age) * clamp((Number(p.DBH_in_cm) || 10) / 70, .12, 1.4) * reach;
    if (distance < 55 && p.SpeciesName) species.add(p.SpeciesName);
    nearby += 1;
  });
  return { life: clamp(Math.sqrt(canopy / 56), 0, 1), maturity: clamp(maturity / 4.2, 0, 1), diversity: clamp(species.size / 7, 0, 1), nearby };
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
  debug.textContent = `field ${Math.round(field.life * 100)} · maturity ${Math.round(field.maturity * 100)} · diversity ${Math.round(field.diversity * 100)} · GPS ±${Math.round(position.coords.accuracy)}m`;
}
function playPulse(context, { frequency, strength, offset, duration, type = 'sine' }) {
  const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + offset / 1000, end = start + duration / 1000;
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(strength, start + .018); gain.gain.exponentialRampToValueAtTime(.0001, end);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(end + .03); activeOscillators.push(oscillator);
  oscillator.addEventListener('ended', () => { activeOscillators = activeOscillators.filter((active) => active !== oscillator); }, { once: true });
}
function createConcretePattern(context, intensity) {
  const base = 48 + Math.random() * 11, interruptions = intensity > .65 ? 4 : 3;
  for (let index = 0; index < interruptions; index += 1) playPulse(context, { frequency: base + (index % 2) * 7, strength: .08 + intensity * .14, offset: index * (105 + Math.random() * 58), duration: 65 + Math.random() * 70, type: index % 2 ? 'triangle' : 'sine' });
}
function createLivingPattern(context, reading) {
  const pulseCount = 1 + Math.round(reading.diversity * 2), spacing = 185 + (1 - reading.life) * 90;
  for (let index = 0; index < pulseCount; index += 1) playPulse(context, { frequency: 40 + reading.maturity * 11 + index * 1.5, strength: .14 + reading.life * .28 + reading.maturity * .12, offset: 410 + index * spacing + (Math.random() - .5) * 44 * reading.diversity, duration: 125 + reading.maturity * 145 });
  if (reading.life > .78) playPulse(context, { frequency: 38, strength: .38 + reading.maturity * .12, offset: 1040, duration: 260 });
}
function playFieldCycle() { const context = getAudioContext(); if (!context) return; createConcretePattern(context, 1 - field.life * .65); if (field.life > .12) createLivingPattern(context, field); }
function scheduleFieldCycle() { if (!isWalking) return; playFieldCycle(); fieldTimer = window.setTimeout(scheduleFieldCycle, field.life > .72 ? 1450 : 1100 + Math.random() * 280); }
function clearAudio() { window.clearTimeout(fieldTimer); fieldTimer = null; activeOscillators.forEach((oscillator) => { try { oscillator.stop(); } catch { /* already ended */ } }); activeOscillators = []; }
function locationError(error) { isWalking = false; clearAudio(); startButton.disabled = false; startButton.textContent = 'try again'; stopButton.disabled = true; status.textContent = 'location unavailable'; debug.textContent = error.code === 1 ? 'allow location access, then try again.' : 'move outside or wait for a clearer GPS signal.'; }
function startField() {
  if (!navigator.geolocation) { status.textContent = 'location is unavailable in this browser'; return; }
  getAudioContext(); isWalking = true; startButton.disabled = true; startButton.textContent = 'reading the street'; stopButton.disabled = false; instruction.textContent = 'walk. let the rhythm pull you.'; app.classList.add('active'); status.textContent = 'finding your position'; debug.textContent = 'allow location access to begin the field.';
  watchId = navigator.geolocation.watchPosition(updateField, locationError, { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }); scheduleFieldCycle();
}
function stopField() { isWalking = false; clearAudio(); if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; app.classList.remove('active', 'is-threshold', 'is-living', 'is-contact'); startButton.disabled = false; startButton.textContent = 'begin field walk'; stopButton.disabled = true; instruction.textContent = 'let the street speak through the strap.'; fieldValue.textContent = 'waiting'; fieldHint.textContent = 'concrete is never silent.'; status.textContent = 'stopped'; debug.textContent = 'City of Sydney tree data · GPS stays on this device.'; }
fetch(DATA_URL).then((response) => { if (!response.ok) throw new Error('Tree data could not load'); return response.json(); }).then((data) => { trees = data.features.filter((tree) => tree.geometry?.type === 'Point' && tree.properties?.Tree_Status === 'Tree'); startButton.disabled = false; startButton.textContent = 'begin field walk'; status.textContent = `${trees.length} trees ready`; }).catch(() => { status.textContent = 'tree field could not load'; debug.textContent = 'check your connection, then reload.'; });
startButton.addEventListener('click', startField); stopButton.addEventListener('click', stopField);
