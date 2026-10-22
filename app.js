/* hummm — pcc contact field: tree data and GPS stay local in the browser. */
const DATA_URL = 'data/perth-cultural-centre-trees.geojson';
const INFLUENCE_RADIUS_METRES = 90;
const CONTACT_RADIUS_METRES = 18;
const CONTACT_EXIT_RADIUS_METRES = 28;
const CONNECTION_EXIT_RADIUS_METRES = 10;
const GESTURE_RADIUS_METRES = 45;
const GESTURE_EXIT_RADIUS_METRES = 55;
const GPS_STATIONARY_DRIFT_METRES = 6;
const ROTATION_TARGET_DEGREES = 150;
const GESTURE_IDLE_RESET_MS = 700;
const LISTEN_DURATION_MS = 3200;
const app = document.querySelector('#app');
const instruction = document.querySelector('#instruction');
const connectorTitle = document.querySelector('#connectorTitle');
const status = document.querySelector('#status');
const debug = document.querySelector('#debug');
const gpsPoint = document.querySelector('#gpsPoint');
const startButton = document.querySelector('#startButton');
const stopButton = document.querySelector('#stopButton');
const loader = document.querySelector('#loader');
const loaderText = document.querySelector('#loaderText');
const treePoint = document.querySelector('#treePoint');
let trees = [], audioContext = null, activeOscillators = [], fieldTimer = null, watchId = null, wakeLock = null, isWalking = false;
let field = { life: 0, maturity: 0, diversity: 0, nearby: 0, nearest: null, canopy: 0 };
let lastPosition = null, stationarySince = 0, lastWalkingSignalAt = 0;
let selectedLocalTree = null;
let contactPhase = 'silent', contactTimer = null, journeyInstructionTimer = null, journeyStartedAt = 0, connectionLostUntil = 0, presenceOscillator = null, presenceGain = null, presenceLfo = null, presenceLfoGain = null;
let orientationPermissionState = 'unknown';
let orientationListening = false, orientationHeading = null, orientationTravel = 0, motionTravel = 0, lastMotionTime = 0, lastGestureTime = 0, lastAcceleration = null, lastRotationVector = null, coherentMotionMs = 0, motionEvidenceMs = 0, interactionMovement = 0, encounterConfirmed = false;
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
  const profiles = ['defending', 'kin · transferring', 'under strain'];
  return { id: p.TREE_ID || key, name: p.COMMON_NAME || p.BOTANICAL_NAME || 'tree', seed: hash, profile: profiles[hash % profiles.length], age: clamp(age / 35, 0, 1), scale: clamp((height / 30) * .6 + canopy * .4, 0, 1), irregularity: .12 + ((hash >>> 9) % 28) / 100, offset: (hash % 360) / 360 };
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
function showConcreteBaseline() {
  field = { life: 0, maturity: 0, diversity: 0, nearby: 0, nearest: null, canopy: 0 };
  connectorTitle.textContent = 'connector'; instruction.textContent = 'move · find a tree';
  app.classList.remove('is-threshold', 'is-living', 'is-contact');
  status.textContent = 'gps active · finding a tree';
  gpsPoint.textContent = 'gps point · acquiring';
  debug.textContent = 'signal 0 · maturity 0 · diversity 0 · gps waiting';
  treePoint.textContent = 'nearest tree · waiting';
}
function journeyInstruction() {
  return journeyStartedAt && Date.now() - journeyStartedAt >= 5000
    ? 'on arrival · hold the phone out · rotate once through a full circle'
    : 'move · find a tree';
}
function updateField(position) {
  if (lastPosition) {
    const distanceMoved = distanceInMetres(lastPosition.coords.latitude, lastPosition.coords.longitude, position.coords.latitude, position.coords.longitude);
    const speed = position.coords.speed;
    // GPS can wander several metres while the participant is still. Allow
    // that drift so holding the phone out and turning it is not read as walking.
    if (distanceMoved > GPS_STATIONARY_DRIFT_METRES || (Number.isFinite(speed) && speed > .8)) { stationarySince = 0; lastWalkingSignalAt = Date.now(); }
    else if (!stationarySince) stationarySince = Date.now();
  } else stationarySince = Date.now();
  lastPosition = position;
  field = readField(position.coords.latitude, position.coords.longitude);
  if (selectedLocalTree && contactPhase !== 'silent') {
    const [lon, lat] = selectedLocalTree.tree.geometry.coordinates;
    const distance = distanceInMetres(position.coords.latitude, position.coords.longitude, lat, lon);
    const gestureRadius = contactPhase === 'presence' && !encounterConfirmed ? GESTURE_RADIUS_METRES : CONTACT_EXIT_RADIUS_METRES;
    if (distance <= gestureRadius) {
      const previousDistance = selectedLocalTree.distance ?? distance;
      selectedLocalTree.distance = distance;
      const distanceShift = Math.abs(distance - previousDistance);
      interactionMovement = clamp(interactionMovement + distanceShift / 6, 0, 1);
      field = { ...field, life: Math.max(field.life, .8), maturity: Math.max(field.maturity, .55), diversity: Math.max(field.diversity, .2), nearby: Math.max(field.nearby, 1), nearest: selectedLocalTree, canopy: Math.max(field.canopy, .65) };
    } else {
      selectedLocalTree = null;
    }
  }
  if (selectedLocalTree && contactPhase === 'silent') {
    const [lon, lat] = selectedLocalTree.tree.geometry.coordinates;
    const distance = distanceInMetres(position.coords.latitude, position.coords.longitude, lat, lon);
    if (distance <= GESTURE_EXIT_RADIUS_METRES) {
      selectedLocalTree.distance = distance;
      if (!field.nearest || distance < field.nearest.distance) {
        field = { ...field, life: Math.max(field.life, .8), maturity: Math.max(field.maturity, .55), diversity: Math.max(field.diversity, .2), nearby: Math.max(field.nearby, 1), nearest: selectedLocalTree, canopy: Math.max(field.canopy, .65) };
      }
    } else selectedLocalTree = null;
  }
  if (contactPhase === 'silent') {
    const mappedNearby = field.nearest && field.nearest.distance <= GESTURE_RADIUS_METRES;
    const stationary = stationarySince && Date.now() - stationarySince > 1200 && Date.now() - lastWalkingSignalAt > 1200;
    const connectionLost = connectionLostUntil > Date.now();
    connectorTitle.textContent = mappedNearby && !connectionLost ? 'tree nearby' : 'connector';
    instruction.textContent = connectionLost
      ? 'connection lost · move closer to reconnect'
      : mappedNearby
      ? 'stop · then hold your phone out · rotate once through a full circle'
      : stationary
        ? 'stop · choose a tree · hold your phone out · rotate once through a full circle'
        : journeyInstruction();
  }
  const nearTree = field.nearest?.distance || Infinity;
  app.classList.toggle('is-threshold', nearTree <= 45 && nearTree > CONTACT_RADIUS_METRES); app.classList.toggle('is-living', field.life >= .5 || (nearTree <= CONTACT_RADIUS_METRES && nearTree > 5)); app.classList.toggle('is-contact', encounterConfirmed && nearTree <= CONTACT_RADIUS_METRES);
  const nearestText = field.nearest ? ` · nearest ${Math.round(field.nearest.distance)}m` : '';
  status.textContent = `${field.nearby} trees within ${INFLUENCE_RADIUS_METRES}m${nearestText}`;
  gpsPoint.textContent = `gps point · ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)} · ±${Math.round(position.coords.accuracy)}m`;
  debug.textContent = `signal ${Math.round(field.life * 100)} · maturity ${Math.round(field.maturity * 100)} · diversity ${Math.round(field.diversity * 100)} · gps ±${Math.round(position.coords.accuracy)}m${wakeLock ? ' · screen awake' : ''}`;
  const nearestLabel = field.nearest?.tree.properties?.MANUAL_CONTACT ? 'local encounter' : 'nearest tree';
  treePoint.textContent = field.nearest ? `${nearestLabel} · ${field.nearest.signature.name} · ${Math.round(field.nearest.distance)}m · id ${field.nearest.signature.id}` : 'nearest tree · none in range';
  if (isWalking && connectionLostUntil <= Date.now() && field.nearest && field.nearest.distance <= GESTURE_RADIUS_METRES) enterContact();
  else if (isWalking && (!field.nearest || field.nearest.distance > (contactPhase === 'responding' ? CONNECTION_EXIT_RADIUS_METRES : GESTURE_EXIT_RADIUS_METRES))) leaveContact();
}
function playPulse(context, { frequency, strength, offset, duration, type = 'sine' }) {
  const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + offset / 1000, end = start + duration / 1000;
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(strength, start + .018); gain.gain.exponentialRampToValueAtTime(.0001, end);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(end + .03); activeOscillators.push(oscillator);
  oscillator.addEventListener('ended', () => { activeOscillators = activeOscillators.filter((active) => active !== oscillator); }, { once: true });
}
function createConcretePattern(context, reading) {
  const density = clamp((reading.nearby || 0) / 8, 0, 1), strength = .34 + density * .06;
  playPulse(context, { frequency: 44 + density * 2, strength, offset: 0, duration: 125 });
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
  const distance = reading.nearest?.distance ?? 45, proximity = clamp(1 - distance / 45, 0, 1), density = clamp(reading.nearby / 5, 0, 1), scale = signature.scale, movement = interactionMovement;
  const strength = (.62 + proximity * .24 + reading.maturity * .14 + scale * .16) * (1 + movement * .24);
  const wobble = signature.irregularity * 150, base = 34 + scale * 12 + (signature.seed % 8), drift = Math.sin(Date.now() / 1800 + signature.offset * 8) * (1 + movement * 6);
  if (signature.profile === 'defending') {
    // A low body-bed interrupted by sharp, airborne warning-like fragments.
    playPulse(context, { frequency: base - 5 + drift, strength, offset: 0, duration: 360 + scale * 180, type: 'sine' });
    playPulse(context, { frequency: base + 15, strength: strength * .62, offset: 180 + wobble * .2, duration: 130, type: 'sawtooth' });
    playPulse(context, { frequency: base + 3 - drift, strength: strength * .82, offset: 430 + wobble, duration: 260 + scale * 120, type: 'triangle' });
    playPulse(context, { frequency: base + 22, strength: strength * (.42 + density * .25), offset: 760 + wobble * .5, duration: 110 + movement * 100, type: 'sawtooth' });
    playPulse(context, { frequency: base - 8, strength: strength * .78, offset: 980 + wobble, duration: 400 + scale * 180, type: 'sine' });
  } else if (signature.profile === 'kin · transferring') {
    // Paired, overlapping pulses: a rhythmic exchange rather than a clean beat.
    playPulse(context, { frequency: base - 3 + drift, strength: strength * .9, offset: 0, duration: 300 + scale * 150 });
    playPulse(context, { frequency: base + 6, strength: strength * .78, offset: 105 + wobble * .2, duration: 230 + scale * 100, type: 'triangle' });
    playPulse(context, { frequency: base - 9, strength: strength * .7, offset: 390 + wobble, duration: 360 + scale * 190 });
    playPulse(context, { frequency: base + 11 + density * 5, strength: strength * .68, offset: 700 + wobble * .65, duration: 180 + movement * 110, type: 'sine' });
    playPulse(context, { frequency: base - 1, strength: strength * .82, offset: 920 + wobble, duration: 330 + scale * 170 });
  } else {
    // A denser, unstable field with high and low components colliding.
    playPulse(context, { frequency: base - 13 + drift, strength: strength * .92, offset: 0, duration: 420 + scale * 170, type: 'triangle' });
    playPulse(context, { frequency: base + 17, strength: strength * .62, offset: 90 + wobble * .2, duration: 150, type: 'sawtooth' });
    playPulse(context, { frequency: base + 2, strength, offset: 250 + wobble * .4, duration: 260 + scale * 160 });
    playPulse(context, { frequency: base + 24, strength: strength * .5, offset: 510 + wobble, duration: 120 + movement * 100, type: 'sawtooth' });
    playPulse(context, { frequency: base - 7, strength: strength * .82, offset: 700 + wobble * .7, duration: 390 + scale * 200, type: 'sine' });
    playPulse(context, { frequency: base + 9, strength: strength * .68, offset: 1050 + wobble, duration: 200 + scale * 120, type: 'triangle' });
  }
  interactionMovement = 0;
}
function createArrivalPattern(context, reading) {
  const signature = reading.nearest?.signature || treeSignature(reading.nearest?.tree || manualContactTrees[0]);
  const scale = signature.scale, base = 35 + scale * 11 + (signature.seed % 6), strength = .96 + scale * .16, wobble = signature.irregularity * 150;
  // The arrival is deliberately overfull: overlapping, detuned pulses create
  // the sense of a signal forcing its way through air and interference.
  playPulse(context, { frequency: base, strength, offset: 0, duration: 300 + scale * 160, type: 'triangle' });
  playPulse(context, { frequency: base + 9, strength: strength * .92, offset: 120, duration: 210 + scale * 120, type: 'sawtooth' });
  playPulse(context, { frequency: base - 4, strength: strength * .9, offset: 260, duration: 470 + scale * 190, type: 'sine' });
  playPulse(context, { frequency: base + 15, strength: strength * .74, offset: 390 + wobble * .2, duration: 180 + scale * 120, type: 'sawtooth' });
  playPulse(context, { frequency: base - 11, strength: strength * .8, offset: 560 + wobble * .35, duration: 520 + scale * 220, type: 'triangle' });
  playPulse(context, { frequency: base + 5, strength: strength * .7, offset: 780 + wobble * .5, duration: 260 + scale * 150, type: 'sawtooth' });
  playPulse(context, { frequency: base + 18, strength: strength * .58, offset: 980 + wobble * .7, duration: 210 + scale * 120, type: 'triangle' });
  playPulse(context, { frequency: base - 7, strength: strength * .76, offset: 1180 + wobble, duration: 540 + scale * 240, type: 'sine' });
  playPulse(context, { frequency: base + 12, strength: strength * .55, offset: 1480 + wobble * 1.1, duration: 300 + scale * 160, type: 'sawtooth' });
  playPulse(context, { frequency: base - 15, strength: strength * .5, offset: 1690 + wobble * 1.3, duration: 460 + scale * 220, type: 'triangle' });
}
function playFieldCycle() {
  const context = getAudioContext(); if (!context) return;
  if (contactPhase === 'silent' || (contactPhase === 'presence' && !encounterConfirmed)) createConcretePattern(context, field);
  else if (contactPhase !== 'responding') return;
  else if (field.life < .23) createConcretePattern(context, field);
  else if (field.life < .5) createThresholdPattern(context, field);
  else if (field.life < .78) createLivingPattern(context, field);
  else createContactPattern(context, field);
}
function scheduleFieldCycle() { if (!isWalking) return; playFieldCycle(); fieldTimer = window.setTimeout(scheduleFieldCycle, contactPhase === 'silent' || (contactPhase === 'presence' && !encounterConfirmed) ? 3000 : 2600); }
function stopPresence() {
  if (presenceOscillator) { try { presenceOscillator.stop(); } catch { /* already ended */ } }
  if (presenceLfo) { try { presenceLfo.stop(); } catch { /* already ended */ } }
  presenceOscillator = null; presenceGain = null; presenceLfo = null; presenceLfoGain = null;
}
function closeMicrophone() {
}
function clearAudio() {
  window.clearTimeout(fieldTimer); fieldTimer = null; window.clearTimeout(contactTimer); contactTimer = null;
  activeOscillators.forEach((oscillator) => { try { oscillator.stop(); } catch { /* already ended */ } });
  activeOscillators = []; stopPresence(); closeMicrophone(); contactPhase = 'silent'; connectionLostUntil = 0; selectedLocalTree = null; lastPosition = null; stationarySince = 0; lastWalkingSignalAt = 0; orientationListening = false; orientationHeading = null; orientationTravel = 0; motionTravel = 0; lastMotionTime = 0; lastGestureTime = 0; lastAcceleration = null; lastRotationVector = null; coherentMotionMs = 0; motionEvidenceMs = 0;
  window.removeEventListener('deviceorientation', captureHeading, true); window.removeEventListener('devicemotion', captureMotion, true);
}
function startPresence() {
  // Near-tree presence stays event-driven: the journey heartbeat continues until
  // the circle is complete, rather than turning into a continuous drone.
}
function normaliseHeading(value) { return (value + 360) % 360; }
function headingDelta(from, to) { let delta = normaliseHeading(to - from); return delta > 180 ? delta - 360 : delta; }
function selectLocalEncounter() {
  if (!isWalking || contactPhase !== 'silent' || !lastPosition) return;
  if (!field.nearest || field.nearest.distance > GESTURE_RADIUS_METRES) {
    const tree = { type: 'Feature', geometry: { type: 'Point', coordinates: [lastPosition.coords.longitude, lastPosition.coords.latitude] }, properties: { TREE_ID: `unmapped-${Math.round(lastPosition.coords.latitude * 100000)}-${Math.round(lastPosition.coords.longitude * 100000)}`, COMMON_NAME: 'unmapped tree', TREE_HEIGHT: 12, MANUAL_CONTACT: true } };
    field = { ...field, life: .8, maturity: .55, diversity: .2, nearby: 1, nearest: { distance: 0, tree, radius: canopyRadius(tree), signature: treeSignature(tree) }, canopy: .65 };
    selectedLocalTree = field.nearest;
  }
  selectedLocalTree = field.nearest;
  contactPhase = 'presence'; encounterConfirmed = false; orientationTravel = 0; motionTravel = 0; interactionMovement = 0;
  connectorTitle.textContent = 'tree nearby'; instruction.textContent = 'circle complete · opening connection';
  const encounterLabel = field.nearest.tree.properties?.MANUAL_CONTACT ? 'local encounter' : 'nearest tree';
  treePoint.textContent = `${encounterLabel} · ${field.nearest.signature.name} · ${Math.round(field.nearest.distance)}m · id ${field.nearest.signature.id}`;
  startPresence(field); confirmEncounter();
}
function captureHeading(event) {
  if (!orientationListening || typeof event.alpha !== 'number') return;
  const heading = normaliseHeading(360 - event.alpha);
  if (orientationHeading === null) orientationHeading = heading;
  else { const delta = Math.abs(headingDelta(orientationHeading, heading)); const stationary = stationarySince && Date.now() - stationarySince > 1200 && Date.now() - lastWalkingSignalAt > 1200; if (!encounterConfirmed && stationary && delta > 2) orientationTravel += delta; if (encounterConfirmed && delta > 3) interactionMovement = clamp(interactionMovement + delta / 90, 0, 1); orientationHeading = heading; checkRotationProgress(); }
}
function captureMotion(event) {
  if (!orientationListening || !event.rotationRate) return;
  const gpsSpeed = lastPosition?.coords?.speed;
  const linearAcceleration = event.acceleration;
  const linearMagnitude = linearAcceleration ? Math.sqrt((linearAcceleration.x || 0) ** 2 + (linearAcceleration.y || 0) ** 2 + (linearAcceleration.z || 0) ** 2) : 0;
  if ((Number.isFinite(gpsSpeed) && gpsSpeed > .3) || linearMagnitude > .8) {
    lastWalkingSignalAt = Date.now();
    orientationTravel = 0; motionTravel = 0; coherentMotionMs = 0; motionEvidenceMs = 0; lastGestureTime = 0; return;
  }
  const now = event.timeStamp || performance.now(), elapsed = lastMotionTime ? Math.min((now - lastMotionTime) / 1000, .2) : 0;
  lastMotionTime = now;
  const rate = Math.sqrt((event.rotationRate.alpha || 0) ** 2 + (event.rotationRate.beta || 0) ** 2 + (event.rotationRate.gamma || 0) ** 2);
  const acceleration = event.accelerationIncludingGravity;
  const accelerationChange = acceleration && lastAcceleration ? Math.sqrt((acceleration.x - lastAcceleration.x) ** 2 + (acceleration.y - lastAcceleration.y) ** 2 + (acceleration.z - lastAcceleration.z) ** 2) : 0;
  if (acceleration) lastAcceleration = { x: acceleration.x || 0, y: acceleration.y || 0, z: acceleration.z || 0 };
  const rotationVector = rate ? { x: (event.rotationRate.alpha || 0) / rate, y: (event.rotationRate.beta || 0) / rate, z: (event.rotationRate.gamma || 0) / rate } : null;
  const coherence = rotationVector && lastRotationVector ? rotationVector.x * lastRotationVector.x + rotationVector.y * lastRotationVector.y + rotationVector.z * lastRotationVector.z : 0;
  const deliberateMotion = rate > 3 && (!acceleration || accelerationChange > .05) && coherence > .2;
  if (rotationVector) lastRotationVector = rotationVector;
  if (deliberateMotion) { if (lastGestureTime && now - lastGestureTime > GESTURE_IDLE_RESET_MS) { orientationTravel = 0; motionTravel = 0; coherentMotionMs = 0; motionEvidenceMs = 0; } lastGestureTime = now; motionTravel += rate * elapsed; coherentMotionMs += elapsed * 1000; motionEvidenceMs += elapsed * 1000; }
  else { coherentMotionMs = Math.max(0, coherentMotionMs - elapsed * 1800); motionEvidenceMs = Math.max(0, motionEvidenceMs - elapsed * 1800); motionTravel = Math.max(0, motionTravel - rate * elapsed * .7); }
  if (encounterConfirmed) interactionMovement = clamp(interactionMovement + rate * elapsed / 180, 0, 1);
  checkRotationProgress();
}
function checkRotationProgress() {
  const travel = orientationTravel, stationary = stationarySince && Date.now() - stationarySince > 1200 && Date.now() - lastWalkingSignalAt > 1200;
  if (!encounterConfirmed && stationary && travel > 0 && (contactPhase === 'presence' || contactPhase === 'silent')) {
    connectorTitle.textContent = 'tree nearby';
    instruction.textContent = `turning · ${Math.round(clamp(travel / ROTATION_TARGET_DEGREES, 0, 1) * 100)}%`;
  }
  if (stationary && travel >= ROTATION_TARGET_DEGREES) {
    connectorTitle.textContent = 'tree nearby'; instruction.textContent = 'circle complete · opening connection';
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
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== 'granted') { orientationPermissionState = 'denied'; return false; }
    }
    if (typeof DeviceOrientationEvent === 'undefined' && typeof DeviceMotionEvent === 'undefined') { orientationPermissionState = 'unavailable'; return false; }
    orientationPermissionState = 'ready';
    orientationHeading = null; orientationTravel = 0; motionTravel = 0; lastMotionTime = 0; lastGestureTime = 0; lastAcceleration = null; lastRotationVector = null; coherentMotionMs = 0; motionEvidenceMs = 0; orientationListening = true;
    if (typeof DeviceOrientationEvent !== 'undefined') window.addEventListener('deviceorientation', captureHeading, true);
    if (typeof DeviceMotionEvent !== 'undefined') window.addEventListener('devicemotion', captureMotion, true);
    return true;
  } catch { orientationPermissionState = 'denied'; return false; }
}
function confirmEncounter(message = 'the connection is open') {
  if (encounterConfirmed || contactPhase === 'silent') return;
  encounterConfirmed = true; contactPhase = 'responding'; window.clearTimeout(contactTimer); contactTimer = null;
  const profile = field.nearest?.signature?.profile || 'local encounter';
  interactionMovement = 0; app.classList.add('is-contact'); connectorTitle.textContent = 'contact'; instruction.textContent = `${profile} · ${message}`;
  const context = getAudioContext(); if (context) createArrivalPattern(context, field);
}
function enterContact() {
  if (contactPhase !== 'silent') return;
  connectionLostUntil = 0; encounterConfirmed = false; selectedLocalTree = field.nearest; orientationHeading = null; orientationTravel = 0; motionTravel = 0; lastMotionTime = 0; lastGestureTime = 0; lastAcceleration = null; lastRotationVector = null; coherentMotionMs = 0; motionEvidenceMs = 0; interactionMovement = 0; contactPhase = 'presence'; connectorTitle.textContent = 'tree nearby'; instruction.textContent = 'pause here · breathe · hold your phone out · rotate once through a full circle'; startPresence(field);
  if (!orientationListening) requestOrientation();
}
function leaveContact() {
  if (contactPhase === 'silent') return;
  const wasConnected = contactPhase === 'responding' || encounterConfirmed;
  contactPhase = 'silent'; window.clearTimeout(contactTimer); contactTimer = null; stopPresence(); closeMicrophone();
  connectionLostUntil = wasConnected ? Date.now() + 4000 : 0; encounterConfirmed = false; orientationHeading = null; orientationTravel = 0; motionTravel = 0; lastMotionTime = 0; lastGestureTime = 0; lastAcceleration = null; lastRotationVector = null; coherentMotionMs = 0; motionEvidenceMs = 0; interactionMovement = 0; orientationListening = false; window.removeEventListener('deviceorientation', captureHeading, true); window.removeEventListener('devicemotion', captureMotion, true); connectorTitle.textContent = 'connector'; instruction.textContent = wasConnected ? 'connection lost · move closer to reconnect' : journeyInstruction(); app.classList.remove('is-contact');
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
  isWalking = true; journeyStartedAt = Date.now(); window.clearTimeout(journeyInstructionTimer); journeyInstructionTimer = window.setTimeout(() => { if (isWalking && contactPhase === 'silent') instruction.textContent = journeyInstruction(); }, 5000); startButton.disabled = true; startButton.textContent = 'reading the connection'; stopButton.disabled = false; app.classList.add('active'); showConcreteBaseline();
  try {
    getAudioContext();
    requestOrientation().then((motionReady) => {
      if (!isWalking || contactPhase !== 'silent') return;
      if (!motionReady && orientationPermissionState === 'denied') instruction.textContent = 'motion access unavailable · full circle skipped';
      else if (contactPhase === 'silent') instruction.textContent = journeyInstruction();
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
function stopField() { isWalking = false; window.clearTimeout(journeyInstructionTimer); journeyInstructionTimer = null; journeyStartedAt = 0; clearAudio(); releaseWakeLock(); if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; app.classList.remove('active', 'is-threshold', 'is-living', 'is-contact'); startButton.disabled = false; startButton.textContent = 'begin encounter'; stopButton.disabled = true; connectorTitle.textContent = 'connector'; instruction.textContent = 'move · find a tree'; status.textContent = 'stopped'; gpsPoint.textContent = 'gps point · stopped'; treePoint.textContent = 'nearest tree · waiting'; debug.textContent = 'city of perth tree data · gps stays on this device.'; }
document.addEventListener('visibilitychange', () => { if (isWalking && document.visibilityState === 'visible' && !wakeLock) requestWakeLock(); });
fetch(DATA_URL).then((response) => { if (!response.ok) throw new Error('Tree data could not load'); return response.json(); }).then((data) => {
  trees = data.features.filter((tree) => tree.geometry?.type === 'Point' && tree.properties?.RETIRED !== 'Yes').concat(manualContactTrees);
  app.setAttribute('aria-busy', 'false'); loader.hidden = true; startButton.disabled = false; startButton.textContent = 'begin encounter'; status.textContent = `${trees.length} perth trees ready`;
}).catch(() => { app.setAttribute('aria-busy', 'false'); loaderText.textContent = 'connection unavailable'; status.textContent = 'tree data could not load'; debug.textContent = 'check your connection, then reload.'; });
startButton.addEventListener('click', startField); stopButton.addEventListener('click', stopField);
