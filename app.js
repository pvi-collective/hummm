/*
  hummm — Haptic Composer

  The Woojer Strap 4 behaves as a Bluetooth audio device. This file
  creates low-frequency audio pulses in the browser; the phone sends them
  to whichever Bluetooth audio output is active. No recorded audio files
  are needed for this first composer.

  Later, each state can be replaced with a richer sound file or a more
  complex procedural heartbeat without changing the interface.
*/

const STATES = Object.freeze({
  awakening: {
    description: 'slow and distant',
    frequency: 48,
    gain: 0.38,
    pulses: [[0, 150]],
    cycle: 2400
  },
  invitation: {
    description: 'gently calling',
    frequency: 52,
    gain: 0.42,
    pulses: [[0, 125], [250, 125]],
    cycle: 1900
  },
  curiosity: {
    description: 'awake and searching',
    frequency: 56,
    gain: 0.45,
    pulses: [[0, 100], [190, 80], [420, 115]],
    cycle: 1700
  },
  purpose: {
    description: 'steady and present',
    frequency: 60,
    gain: 0.5,
    pulses: [[0, 130], [280, 130], [560, 130]],
    cycle: 1450
  },
  distress: {
    description: 'urgent and insistent',
    frequency: 65,
    gain: 0.62,
    pulses: [[0, 115], [170, 115], [340, 130], [525, 115], [690, 145]],
    cycle: 1200
  },
  relief: {
    description: 'long and settling',
    frequency: 44,
    gain: 0.46,
    pulses: [[0, 850]],
    cycle: 1700
  }
});

const app = document.querySelector('#app');
const instruction = document.querySelector('#instruction');
const status = document.querySelector('#status');
const debug = document.querySelector('#debug');
const stateButtons = [...document.querySelectorAll('[data-state]')];
const loopToggle = document.querySelector('#loopToggle');
const stopButton = document.querySelector('#stopButton');

let audioContext = null;
let selectedState = null;
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

function playPulse(context, state, offsetMs, durationMs) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startTime = context.currentTime + offsetMs / 1000;
  const endTime = startTime + durationMs / 1000;

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(state.frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(state.gain, startTime + 0.025);
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

function playStateOnce(name) {
  const state = STATES[name];
  const context = getAudioContext();

  if (!state || !context) {
    status.textContent = 'web audio is unavailable in this browser';
    return;
  }

  state.pulses.forEach(([offsetMs, durationMs]) => {
    playPulse(context, state, offsetMs, durationMs);
  });
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

function scheduleLoop(name) {
  const state = STATES[name];
  if (!state || !loopToggle.checked || selectedState !== name) return;

  loopTimer = window.setTimeout(() => {
    playStateOnce(name);
    scheduleLoop(name);
  }, state.cycle);
}

function selectState(name) {
  clearPlayback();
  selectedState = name;

  stateButtons.forEach((button) => {
    const isSelected = button.dataset.state === name;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });

  app.classList.toggle('distress', name === 'distress');
  app.classList.toggle('relief', name === 'relief');
  app.classList.add('active');
  instruction.textContent = STATES[name].description;
  status.textContent = `${name}${loopToggle.checked ? ' · looping' : ''}`;
  debug.textContent = 'low-frequency audio is playing through the selected Bluetooth output.';
  stopButton.disabled = false;

  playStateOnce(name);
  scheduleLoop(name);
}

function stop() {
  clearPlayback();
  selectedState = null;

  stateButtons.forEach((button) => {
    button.classList.remove('is-selected');
    button.setAttribute('aria-pressed', 'false');
  });

  app.classList.remove('active', 'distress', 'relief');
  instruction.textContent = 'choose a state. feel it in your body.';
  status.textContent = 'stopped';
  debug.textContent = 'audio output follows your phone’s selected Bluetooth device.';
  stopButton.disabled = true;
}

stateButtons.forEach((button) => {
  button.addEventListener('click', () => selectState(button.dataset.state));
});

loopToggle.addEventListener('change', () => {
  if (!selectedState) return;

  clearPlayback();
  playStateOnce(selectedState);
  scheduleLoop(selectedState);
  status.textContent = `${selectedState} · loop ${loopToggle.checked ? 'on' : 'off'}`;
});

stopButton.addEventListener('click', stop);
