/*
  hummm — Haptic Composer

  A small tool for comparing tactile states before they are used in
  a wayfinding walk. Playback is added in the next commit.
*/

const STATES = Object.freeze({
  awakening: 'slow and distant',
  invitation: 'gently calling',
  curiosity: 'awake and searching',
  purpose: 'steady and present',
  distress: 'urgent and insistent',
  relief: 'long and settling'
});

const app = document.querySelector('#app');
const instruction = document.querySelector('#instruction');
const status = document.querySelector('#status');
const stateButtons = [...document.querySelectorAll('[data-state]')];
const loopToggle = document.querySelector('#loopToggle');
const stopButton = document.querySelector('#stopButton');

let selectedState = null;

function selectState(name) {
  selectedState = name;

  stateButtons.forEach((button) => {
    const isSelected = button.dataset.state === name;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });

  app.classList.toggle('distress', name === 'distress');
  app.classList.toggle('relief', name === 'relief');
  instruction.textContent = STATES[name];
  status.textContent = `${name}${loopToggle.checked ? ' · loop on' : ''}`;
  stopButton.disabled = false;
}

function stop() {
  selectedState = null;
  stateButtons.forEach((button) => {
    button.classList.remove('is-selected');
    button.setAttribute('aria-pressed', 'false');
  });

  app.classList.remove('distress', 'relief');
  instruction.textContent = 'choose a state. feel it in your body.';
  status.textContent = 'stopped';
  stopButton.disabled = true;
}

stateButtons.forEach((button) => {
  button.addEventListener('click', () => selectState(button.dataset.state));
});

loopToggle.addEventListener('change', () => {
  if (selectedState) {
    status.textContent = `${selectedState} · loop ${loopToggle.checked ? 'on' : 'off'}`;
  }
});

stopButton.addEventListener('click', stop);
