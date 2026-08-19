/*
  hummm — Haptic Composer

  The Woojer Strap 4 behaves as a Bluetooth audio device. This file
  creates low-frequency audio pulses in the browser; the phone sends them
  to whichever Bluetooth audio output is active. No recorded audio files
  are needed for this first composer.

  The public `playEvolution` and `getEvolutionParameters` functions are the
  seam for future procedural sound design or a dedicated Woojer adapter.
*/

const FAR_PARAMETERS = Object.freeze({ tempo: 28, strength: 0.28, pause: 1900, irregularity: 0.02, density: 1, frequency: 46 });
const CLOSE_PARAMETERS = Object.freeze({ tempo: 128, strength: 0.68, pause: 180, irregularity: 0.28, density: 4.6, frequency: 64 });

const app = document.querySelector('#app');
const instruction = document.querySelector('#instruction');
const status = document.querySelector('#status');
const debug = document.querySelector('#debug');
const slider = document.querySelector('#evolutionSlider');
const evolutionHint = document.querySelector('#evolutionHint');
const playButton = document.querySelector('#playButton');
const loopToggle = document.querySelector('#loopToggle');
const stopButton = document.querySelector('#stopButton');

let audioContext = null;
let isPlaying = false;
let loopTimer = null;
let activeOscillators = [];

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  return audioContext;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (start, end, amount) => start + (end - start) * amount;

function getEvolutionParameters(value = Number(slider.value) / 100) {
  const amount = clamp(value, 0, 1);
  return Object.fromEntries(Object.keys(FAR_PARAMETERS).map((key) => [key, lerp(FAR_PARAMETERS[key], CLOSE_PARAMETERS[key], amount)]));
}

function describeEvolution(value) {
  if (value < .2) return 'distant · spacious · quiet';
  if (value < .45) return 'waking · attentive · gathering';
  if (value < .7) return 'present · insistent · alive';
  if (value < .9) return 'near · urgent · restless';
  return 'close · continuous · intense';
}

function playPulse(context, parameters, offsetMs, durationMs) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startTime = context.currentTime + offsetMs / 1000;
  const endTime = startTime + durationMs / 1000;

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(parameters.frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(parameters.strength, startTime + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime + 0.03);

  activeOscillators.push(oscillator);
  oscillator.addEventListener('ended', () => {
    activeOscillators = activeOscillators.filter((item) => item !== oscillator);
  }, { once: true });
}

function createPhrase(parameters) {
  const beatMs = 60000 / parameters.tempo;
  const pulseCount = Math.max(1, Math.round(parameters.density));
  const usableBeat = Math.max(110, beatMs - parameters.pause);
  const spacing = pulseCount > 1 ? usableBeat / pulseCount : 0;

  return Array.from({ length: pulseCount }, (_, index) => {
    const variation = (Math.random() * 2 - 1) * parameters.irregularity * spacing;
    const offset = index === 0 ? 0 : index * spacing + variation;
    const duration = clamp(140 - index * 9 + parameters.strength * 42, 75, 185);
    return [Math.max(0, offset), duration];
  });
}

function playEvolution() {
  const context = getAudioContext();
  const parameters = getEvolutionParameters();

  if (!context) {
    status.textContent = 'web audio is unavailable in this browser';
    return;
  }

  createPhrase(parameters).forEach(([offsetMs, durationMs]) => {
    playPulse(context, parameters, offsetMs, durationMs);
  });

  return 60000 / parameters.tempo;
}

function clearPlayback() {
  window.clearTimeout(loopTimer);
  loopTimer = null;

  activeOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {
      // The pulse may already have ended.
    }
  });
  activeOscillators = [];
}

function scheduleLoop() {
  if (!isPlaying || !loopToggle.checked) return;

  loopTimer = window.setTimeout(() => {
    const beatMs = playEvolution();
    scheduleLoop(beatMs);
  }, 60000 / getEvolutionParameters().tempo);
}

function start() {
  clearPlayback();
  isPlaying = true;
  app.classList.add('active');
  playButton.classList.add('is-playing');
  playButton.textContent = 'feeling the rhythm';
  instruction.textContent = 'move slowly. notice where the feeling changes.';
  status.textContent = `playing${loopToggle.checked ? ' · looping' : ''}`;
  debug.textContent = 'low-frequency audio is playing through the selected Bluetooth output.';
  stopButton.disabled = false;

  playEvolution();
  scheduleLoop();
}

function stop() {
  clearPlayback();
  isPlaying = false;
  app.classList.remove('active');
  playButton.classList.remove('is-playing');
  playButton.textContent = 'feel the rhythm';
  instruction.textContent = 'move slowly. notice where the feeling changes.';
  status.textContent = 'stopped';
  debug.textContent = 'audio output follows your phone’s selected Bluetooth device.';
  stopButton.disabled = true;
}

slider.addEventListener('input', () => {
  const value = Number(slider.value) / 100;
  evolutionHint.textContent = describeEvolution(value);
  if (!isPlaying) return;

  clearPlayback();
  playEvolution();
  scheduleLoop();
  status.textContent = `playing · ${Math.round(value * 100)}% close${loopToggle.checked ? ' · looping' : ''}`;
});

loopToggle.addEventListener('change', () => {
  if (!isPlaying) return;

  clearPlayback();
  playEvolution();
  scheduleLoop();
  status.textContent = `playing · loop ${loopToggle.checked ? 'on' : 'off'}`;
});

playButton.addEventListener('click', start);
stopButton.addEventListener('click', stop);
