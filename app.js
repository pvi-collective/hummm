/* hummm — pcc contact field: tree data and GPS stay local in the browser. */
const DATA_URL = 'data/perth-cultural-centre-trees.geojson';
const INFLUENCE_RADIUS_METRES = 90;
const CONTACT_RADIUS_METRES = 18;
const CONTACT_EXIT_RADIUS_METRES = 28;
const LISTEN_DURATION_MS = 3200;
const CONTACT_CONFIRM_FALLBACK_MS = 9000;
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
const contactState = document.querySelector('#contactState');
const treePoint = document.querySelector('#treePoint');
let trees = [], audioContext = null, activeOscillators = [], fieldTimer = null, watchId = null, wakeLock = null, isWalking = false;
let field = { life: 0, maturity: 0, diversity: 0, nearby: 0, nearest: null, canopy: 0 };
let lastPosition = null;
let selectedLocalTree = null;
let contactPhase = 'silent', contactTimer = null, presenceOscillator = null, presenceGain = null, presenceLfo = null, presenceLfoGain = null, microphoneStream = null, analyser = null, voiceDetected = false;
let microphonePermissionState = 'unknown', orientationPermissionState = 'unknown';
let orientationListening = false, orientationHeading = null, orientationTravel = 0, interactionMovement = 0, encounterConfirmed = false;
const manualContactTrees = [
  { type: 'Feature', geometry: { type: 'Point', coordinates: [115.86011825711716, -31.950042702115724] }, properties: { TREE_ID: 'hummm-contact-a', BOTANICAL_NAME: 'local tree · northbridge contact', COMMON_NAME: 'contact tree', TREE_HEIGHT: 12, MANUAL_CONTACT: true } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [115.860145, -31.950025] }, properties: { TREE_ID: 'hummm-contact-b', BOTANICAL_NAME: 'local tree · northbridge contact', COMMON_NAME: 'contact tree', TREE_HEIGHT: 9, MANUAL_CONTACT: true } }
];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const treeHeight = (tree) => clamp(Number(tree.properties?.TREE_HEIGHT) || 8, 3, 30);
const canopyRadius = (tree) => clamp(treeHeight(tree) * .42, 2.5, 13);
function hashString(value) { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function treeSignature(tree) {
  const p = tree.properties || {}, key = `${p.TREE_ID || tree.geometry.coordinates.join(',')}|${p.BOTANICAL_NAME || p.COMMON_NAME || 'tree'}`;
  const hash = hashString(key), age = p.DATE_PLANTED ? clamp((Date.now() - Number(p.DATE_PLANTED)) / (1000 * 60 * 60 * 24 * 365), 0, 100) : 12;
  const height = treeHeight(tree), canopy = clamp(canopyRadius(tree) / 13, 0, 1);
  return { id: p.TREE_ID || key, name: p.COMMON_NAME || p.BOTANICAL_NAME || 'tree', seed: hash, age: clamp(age / 35, 0, 1), scale: clamp((height / 30) * .6 + canopy * .4, 0, 1), irregularity: .12 + ((hash >>> 9) % 28) / 100, offset: (hash % 360) / 360 };
}

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
    if (!nearest || distance < nearest.distance) nearest = { distance, tree, radius, signature: treeSignature(tree) };
  });
  return { life: clamp(Math.sqrt(canopy / 42), 0, 1), maturity: clamp(maturity / 4.5, 0, 1), diversity: clamp(species.size / 5, 0, 1), nearby, nearest, canopy: clamp(canopy / 42, 0, 1) };
}
function describeField(reading) {
  if (!reading.nearest || reading.nearest.distance > 45) return ['concrete bed', 'find a tree'];
  if (reading.nearest.distance > CONTACT_RADIUS_METRES) return ['tree nearby', 'move closer · the city will notice'];
  if (!encounterConfirmed) return ['encounter', 'hold the phone out · rotate once through a full circle'];
  return ['contact', `${reading.nearest.signature.name} · ${Math.round(reading.nearest.distance)}m`];
}
function showConcreteBaseline() {
  field = { life: 0, maturity: 0, diversity: 0, nearby: 0, nearest: null, canopy: 0 };
  fieldValue.textContent = 'concrete bed'; fieldHint.textContent = 'the city hums · waiting for a tree';
  app.classList.remove('is-threshold', 'is-living', 'is-contact');
  status.textContent = 'gps active · finding a tree';
  gpsPoint.textContent = 'gps point · acquiring';
  debug.textContent = 'signal 0 · maturity 0 · diversity 0 · gps waiting';
  contactState.textContent = 'the city hums · waiting for a tree';
  treePoint.textContent = 'nearest tree · waiting';
}
function updateField(position) {
  lastPosition = position;
  field = readField(position.coords.latitude, position.coords.longitude);
  if (selectedLocalTree && contactPhase !== 'silent') {
    const [lon, lat] = selectedLocalTree.tree.geometry.coordinates;
    const distance = distanceInMetres(position.coords.latitude, position.coords.longitude, lat, lon);
    if (distance <= CONTACT_EXIT_RADIUS_METRES) {
      selectedLocalTree.distance = distance;
      field = { ...field, life: Math.max(field.life, .8), maturity: Math.max(field.maturity, .55), diversity: Math.max(field.diversity, .2), nearby: Math.max(field.nearby, 1), nearest: selectedLocalTree, canopy: Math.max(field.canopy, .65) };
    } else {
      selectedLocalTree = null;
    }
  }
  const [name, description] = describeField(field); fieldValue.textContent = name; fieldHint.textContent = description;
  const nearTree = field.nearest?.distance || Infinity;
  app.classList.toggle('is-threshold', nearTree <= 45 && nearTree > CONTACT_RADIUS_METRES); app.classList.toggle('is-living', field.life >= .5 || (nearTree <= CONTACT_RADIUS_METRES && nearTree > 5)); app.classList.toggle('is-contact', encounterConfirmed && nearTree <= CONTACT_RADIUS_METRES);
  const nearestText = field.nearest ? ` · nearest ${Math.round(field.nearest.distance)}m` : '';
  status.textContent = `${field.nearby} trees within ${INFLUENCE_RADIUS_METRES}m${nearestText}`;
  gpsPoint.textContent = `gps point · ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)} · ±${Math.round(position.coords.accuracy)}m`;
  debug.textContent = `signal ${Math.round(field.life * 100)} · maturity ${Math.round(field.maturity * 100)} · diversity ${Math.round(field.diversity * 100)} · gps ±${Math.round(position.coords.accuracy)}m${wakeLock ? ' · screen awake' : ''}`;
  treePoint.textContent = field.nearest ? `nearest tree · ${field.nearest.signature.name} · ${Math.round(field.nearest.distance)}m · id ${field.nearest.signature.id}` : 'nearest tree · none in range';
  if (isWalking && field.nearest && field.nearest.distance <= CONTACT_RADIUS_METRES) enterContact();
  else if (isWalking && (!field.nearest || field.nearest.distance > CONTACT_EXIT_RADIUS_METRES)) leaveContact();
}
function playPulse(context, { frequency, strength, offset, duration, type = 'sine' }) {
  const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + offset / 1000, end = start + duration / 1000;
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(strength, start + .018); gain.gain.exponentialRampToValueAtTime(.0001, end);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(end + .03); activeOscillators.push(oscillator);
  oscillator.addEventListener('ended', () => { activeOscillators = activeOscillators.filter((active) => active !== oscillator); }, { once: true });
}
function createConcretePattern(context, reading) {
  const density = clamp((reading.nearby || 0) / 8, 0, 1), strength = .36 + density * .08;
  playPulse(context, { frequency: 42 + density * 3, strength, offset: 0, duration: 190 });
  playPulse(context, { frequency: 45 + density * 4, strength: strength * .86, offset: 235 + Math.random() * 35, duration: 145 });
  playPulse(context, { frequency: 40 + density * 2, strength: strength * .42, offset: 650 + Math.random() * 100, duration: 115 });
}
function createNearTreePattern(context, reading) {
  const signature = reading.nearest?.signature || treeSignature(reading.nearest?.tree || manualContactTrees[0]);
  const base = 36 + signature.scale * 10 + (signature.seed % 6), strength = .44 + signature.scale * .1;
  playPulse(context, { frequency: base, strength, offset: 0, duration: 260 + signature.scale * 100 });
  playPulse(context, { frequency: base + 6, strength: strength * .82, offset: 260, duration: 180 + signature.scale * 80 });
  playPulse(context, { frequency: base - 3, strength: strength * .7, offset: 560, duration: 300 + signature.scale * 130 });
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
  const signature = reading.nearest?.signature || treeSignature(reading.nearest?.tree || manualContactTrees[0]);
  const density = clamp(reading.nearby / 5, 0, 1), scale = signature.scale, movement = interactionMovement, strength = (.72 + reading.maturity * .2 + scale * .2) * (1 + movement * .16);
  const wobble = signature.irregularity * 120, base = 36 + scale * 10 + (signature.seed % 7);
  playPulse(context, { frequency: base, strength, offset: 0, duration: 260 + scale * 140 });
  playPulse(context, { frequency: base + 5 + (signature.seed % 4), strength: strength * .86, offset: 240 + (signature.seed % 90), duration: 150 + scale * 100 });
  playPulse(context, { frequency: base - 2, strength: strength * .92, offset: 520 + wobble, duration: 300 + scale * 180 });
  playPulse(context, { frequency: base + 8 + density * 4, strength: strength * .7, offset: 930 + wobble * .7, duration: 180 + scale * 100 });
  playPulse(context, { frequency: base + 12, strength: strength * (.38 + density * .32), offset: 1320 + wobble * 1.2, duration: 140 + scale * 90 });
  if (scale > .6 || signature.age > .65) playPulse(context, { frequency: base - 7, strength: strength * .62, offset: 1660 + wobble, duration: 420 + scale * 180 });
  interactionMovement = 0;
}
function createArrivalPattern(context, reading) {
  const signature = reading.nearest?.signature || treeSignature(reading.nearest?.tree || manualContactTrees[0]);
  const scale = signature.scale, base = 35 + scale * 11 + (signature.seed % 6), strength = .82 + scale * .18;
  playPulse(context, { frequency: base, strength, offset: 0, duration: 280 + scale * 150 });
  playPulse(context, { frequency: base + 7, strength: strength * .88, offset: 190, duration: 220 + scale * 110 });
  playPulse(context, { frequency: base - 3, strength: strength * .92, offset: 470, duration: 420 + scale * 180 });
  playPulse(context, { frequency: base + 11, strength: strength * .7, offset: 760 + signature.irregularity * 130, duration: 250 + scale * 130 });
  playPulse(context, { frequency: base - 8, strength: strength * .68, offset: 1080, duration: 520 + scale * 220 });
  playPulse(context, { frequency: base + 4, strength: strength * .55, offset: 1540 + signature.irregularity * 180, duration: 360 + scale * 180 });
}
function playFieldCycle() {
  const context = getAudioContext(); if (!context) return;
  if (contactPhase === 'silent') createConcretePattern(context, field);
  else if (contactPhase !== 'responding') return;
  else if (field.life < .23) createConcretePattern(context, field);
  else if (field.life < .5) createThresholdPattern(context, field);
  else if (field.life < .78) createLivingPattern(context, field);
  else createContactPattern(context, field);
}
function scheduleFieldCycle() { if (!isWalking) return; playFieldCycle(); fieldTimer = window.setTimeout(scheduleFieldCycle, contactPhase === 'silent' ? 1900 : 2600); }
function stopPresence() {
  if (presenceOscillator) { try { presenceOscillator.stop(); } catch { /* already ended */ } }
  if (presenceLfo) { try { presenceLfo.stop(); } catch { /* already ended */ } }
  presenceOscillator = null; presenceGain = null; presenceLfo = null; presenceLfoGain = null;
}
function closeMicrophone() {
  if (microphoneStream) microphoneStream.getTracks().forEach((track) => track.stop());
  microphoneStream = null; analyser = null;
}
function clearAudio() {
  window.clearTimeout(fieldTimer); fieldTimer = null; window.clearTimeout(contactTimer); contactTimer = null;
  activeOscillators.forEach((oscillator) => { try { oscillator.stop(); } catch { /* already ended */ } });
  activeOscillators = []; stopPresence(); closeMicrophone(); contactPhase = 'silent'; selectedLocalTree = null;
}
function startPresence(reading = field) {
  const context = getAudioContext(); if (!context || presenceOscillator) return;
  presenceOscillator = context.createOscillator(); presenceGain = context.createGain();
  const signature = reading.nearest?.signature, scale = signature?.scale || .35;
  presenceOscillator.type = 'sine'; presenceOscillator.frequency.setValueAtTime(38 + scale * 10, context.currentTime);
  presenceGain.gain.setValueAtTime(.0001, context.currentTime); presenceGain.gain.exponentialRampToValueAtTime(.25 + scale * .16, context.currentTime + .25);
  presenceOscillator.connect(presenceGain); presenceGain.connect(context.destination); presenceOscillator.start();
  presenceLfo = context.createOscillator(); presenceLfoGain = context.createGain();
  presenceLfo.frequency.setValueAtTime(.72 + (signature?.irregularity || .2) * 1.2, context.currentTime);
  presenceLfoGain.gain.setValueAtTime(.08 + scale * .04, context.currentTime);
  presenceLfo.connect(presenceLfoGain); presenceLfoGain.connect(presenceGain.gain); presenceLfo.start();
}
async function prepareMicrophone() {
  if (microphoneStream) return true;
  if (microphonePermissionState === 'denied') return false;
  if (!navigator.mediaDevices?.getUserMedia) { microphonePermissionState = 'unavailable'; return false; }
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    microphonePermissionState = 'ready';
    const context = getAudioContext(); analyser = context?.createAnalyser() || null;
    if (analyser) { analyser.fftSize = 256; const source = context.createMediaStreamSource(microphoneStream); source.connect(analyser); }
    if (contactPhase === 'listening') monitorVoice();
    return true;
  } catch { microphonePermissionState = 'denied'; return false; }
}
function monitorVoice() {
  if (contactPhase !== 'listening' || !analyser) return;
  const samples = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(samples);
  let energy = 0; samples.forEach((sample) => { const value = (sample - 128) / 128; energy += value * value; });
  if (Math.sqrt(energy / samples.length) > .045) voiceDetected = true;
  window.requestAnimationFrame(monitorVoice);
}
function finishListening() {
  if (contactPhase !== 'listening') return;
  contactPhase = 'responding'; contactState.textContent = voiceDetected ? 'the tree is answering' : 'the tree shifts in response';
  const context = getAudioContext(); if (context) createContactPattern(context, { ...field, maturity: clamp(field.maturity + (voiceDetected ? .15 : 0), 0, 1) });
  contactTimer = window.setTimeout(beginListening, 2300);
}
function normaliseHeading(value) { return (value + 360) % 360; }
function headingDelta(from, to) { let delta = normaliseHeading(to - from); return delta > 180 ? delta - 360 : delta; }
function selectLocalEncounter() {
  if (!isWalking || contactPhase !== 'silent' || !lastPosition) return;
  if (!field.nearest || field.nearest.distance > 45) {
    const tree = { type: 'Feature', geometry: { type: 'Point', coordinates: [lastPosition.coords.longitude, lastPosition.coords.latitude] }, properties: { TREE_ID: `unmapped-${Math.round(lastPosition.coords.latitude * 100000)}-${Math.round(lastPosition.coords.longitude * 100000)}`, COMMON_NAME: 'unmapped tree', TREE_HEIGHT: 12, MANUAL_CONTACT: true } };
    field = { ...field, life: .8, maturity: .55, diversity: .2, nearby: 1, nearest: { distance: 0, tree, radius: canopyRadius(tree), signature: treeSignature(tree) }, canopy: .65 };
    selectedLocalTree = field.nearest;
  }
  contactPhase = 'presence'; encounterConfirmed = false; orientationTravel = 0; interactionMovement = 0;
  fieldValue.textContent = 'encounter'; fieldHint.textContent = 'the connection opens here';
  treePoint.textContent = `nearest tree · ${field.nearest.signature.name} · ${Math.round(field.nearest.distance)}m · id ${field.nearest.signature.id}`;
  startPresence(field); const context = getAudioContext(); if (context) createNearTreePattern(context, field); confirmEncounter('contact · connection open');
}
function captureHeading(event) {
  if (!orientationListening || typeof event.alpha !== 'number') return;
  const heading = normaliseHeading(360 - event.alpha);
  if (orientationHeading === null) orientationHeading = heading;
  else { const delta = Math.abs(headingDelta(orientationHeading, heading)); orientationTravel += delta; if (encounterConfirmed) interactionMovement = clamp(interactionMovement + delta / 90, 0, 1); orientationHeading = heading; }
  if (!encounterConfirmed && (contactPhase === 'presence' || contactPhase === 'silent')) contactState.textContent = `turning · ${Math.round(clamp(orientationTravel / 285, 0, 1) * 100)}%`;
  if (orientationTravel >= 285) {
    if (contactPhase === 'presence') confirmEncounter('the connection is open');
    else if (contactPhase === 'silent') selectLocalEncounter();
  }
}
async function requestOrientation() {
  if (orientationListening) return true;
  if (orientationPermissionState === 'denied' || orientationPermissionState === 'unavailable') return false;
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') { orientationPermissionState = 'denied'; return false; }
    }
    if (typeof DeviceOrientationEvent === 'undefined') { orientationPermissionState = 'unavailable'; return false; }
    orientationPermissionState = 'ready';
    orientationHeading = null; orientationTravel = 0; orientationListening = true;
    window.addEventListener('deviceorientation', captureHeading, true);
    return true;
  } catch { orientationPermissionState = 'denied'; return false; }
}
function confirmEncounter(message = 'contact · the tree is here') {
  if (encounterConfirmed || contactPhase === 'silent') return;
  encounterConfirmed = true; contactPhase = 'presence'; window.clearTimeout(contactTimer); contactTimer = null;
  interactionMovement = 0; app.classList.add('is-contact'); contactState.textContent = message;
  const context = getAudioContext(); if (context) createArrivalPattern(context, field);
  contactTimer = window.setTimeout(beginListening, 900);
}
async function beginListening() {
  if (!isWalking || contactPhase === 'silent') return;
  contactPhase = 'listening'; voiceDetected = false; contactState.textContent = 'listening · make a sound or speak';
  prepareMicrophone(); monitorVoice();
  window.clearTimeout(contactTimer); contactTimer = window.setTimeout(finishListening, LISTEN_DURATION_MS);
}
function enterContact() {
  if (contactPhase !== 'silent') return;
  encounterConfirmed = false; orientationHeading = null; orientationTravel = 0; interactionMovement = 0; contactPhase = 'presence'; startPresence(field); contactState.textContent = 'tree nearby · hold the phone out · rotate once through a full circle';
  const context = getAudioContext(); if (context) createNearTreePattern(context, field);
  if (!orientationListening) requestOrientation();
  contactTimer = window.setTimeout(() => { if (!encounterConfirmed) confirmEncounter('contact · movement sensor unavailable'); }, CONTACT_CONFIRM_FALLBACK_MS);
}
function leaveContact() {
  if (contactPhase === 'silent') return;
  contactPhase = 'silent'; window.clearTimeout(contactTimer); contactTimer = null; stopPresence(); closeMicrophone();
  encounterConfirmed = false; orientationHeading = null; orientationTravel = 0; interactionMovement = 0; orientationListening = false; window.removeEventListener('deviceorientation', captureHeading, true); contactState.textContent = 'the contact fades into the street'; app.classList.remove('is-contact');
  selectedLocalTree = null;
}
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch { wakeLock = null; }
}
async function releaseWakeLock() { if (wakeLock) { await wakeLock.release(); wakeLock = null; } }
function locationError(error) { isWalking = false; clearAudio(); releaseWakeLock(); startButton.disabled = false; startButton.textContent = 'try again'; stopButton.disabled = true; status.textContent = 'location unavailable'; gpsPoint.textContent = 'gps point · unavailable'; treePoint.textContent = 'nearest tree · unavailable'; debug.textContent = error.code === 1 ? 'allow location access, then try again.' : 'move outside or wait for a clearer gps signal.'; }
function locationProbeError(error) {
  if (error.code === 1) locationError(error);
  else if (isWalking) debug.textContent = 'signal 0 · maturity 0 · diversity 0 · gps still searching';
}
function startField() {
  if (!navigator.geolocation) { status.textContent = 'location is unavailable in this browser'; return; }
  isWalking = true; startButton.disabled = true; startButton.textContent = 'reading the connection'; stopButton.disabled = false; instruction.textContent = 'move. find a tree. hold the phone out · rotate once through a full circle.'; app.classList.add('active'); showConcreteBaseline();
  contactState.textContent = 'allow access · location · motion · microphone';
  try {
    getAudioContext();
    Promise.all([requestOrientation(), prepareMicrophone()]).then(([motionReady, microphoneReady]) => {
      if (!isWalking || contactPhase !== 'silent') return;
      if (!microphoneReady && microphonePermissionState === 'denied') contactState.textContent = 'microphone access unavailable · haptics still available';
      else if (!motionReady && orientationPermissionState === 'denied') contactState.textContent = 'motion access unavailable · full circle skipped';
      else contactState.textContent = 'the city hums · waiting for a tree';
    });
  } catch { status.textContent = 'connection could not begin'; }
  scheduleFieldCycle();
  const locationOptions = { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 };
  try {
    watchId = navigator.geolocation.watchPosition(updateField, locationError, locationOptions);
    navigator.geolocation.getCurrentPosition(updateField, locationProbeError, locationOptions);
  } catch { locationError({ code: 0 }); }
  requestWakeLock();
}
function stopField() { isWalking = false; clearAudio(); releaseWakeLock(); if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; app.classList.remove('active', 'is-threshold', 'is-living', 'is-contact'); startButton.disabled = false; startButton.textContent = 'begin encounter'; stopButton.disabled = true; instruction.textContent = 'find a tree · hold the phone out · rotate once through a full circle.'; fieldValue.textContent = 'waiting'; fieldHint.textContent = 'the city hums · waiting for a tree'; status.textContent = 'stopped'; gpsPoint.textContent = 'gps point · stopped'; treePoint.textContent = 'nearest tree · waiting'; contactState.textContent = 'the city hums · waiting for a tree'; debug.textContent = 'city of perth tree data · gps stays on this device.'; }
document.addEventListener('visibilitychange', () => { if (isWalking && document.visibilityState === 'visible' && !wakeLock) requestWakeLock(); });
fetch(DATA_URL).then((response) => { if (!response.ok) throw new Error('Tree data could not load'); return response.json(); }).then((data) => {
  trees = data.features.filter((tree) => tree.geometry?.type === 'Point' && tree.properties?.RETIRED !== 'Yes').concat(manualContactTrees);
  app.setAttribute('aria-busy', 'false'); loader.hidden = true; startButton.disabled = false; startButton.textContent = 'begin encounter'; status.textContent = `${trees.length} perth trees ready`;
}).catch(() => { app.setAttribute('aria-busy', 'false'); loaderText.textContent = 'connection unavailable'; status.textContent = 'tree data could not load'; debug.textContent = 'check your connection, then reload.'; });
startButton.addEventListener('click', startField); stopButton.addEventListener('click', stopField);
