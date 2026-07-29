# hummm — Haptic Composer

An experiment for composing and comparing tactile states before they are used in a navigation walk.

## Version 0.1

- Six selectable haptic states: awakening, invitation, curiosity, purpose, distress and relief.
- A loop toggle and stop control.
- Visual design carried across from the hummm navigation prototype.

## Woojer testing

Pair the Woojer Strap 4 to the test phone and make it the active Bluetooth audio output before opening the composer. Each state generates low-frequency Web Audio pulses in the browser. The phone sends that audio to the currently selected output device, which the Woojer translates into touch.

Tap a state to play it once. Turn on **loop** before selecting a state to repeat it until you choose another state or press **stop**.

This build keeps the GPS/arrival interaction from Build 001, but replaces anonymous pulse patterns with named haptic phrases.

Research question: **Can a living haptic language both guide and move a human wayfinder?**

Design principles: Human Wayfinding; Trust before autonomy; Rhythm is language; Silence is productive; Places express themselves; Wayfinders respond through movement; Arrival is joy not achievement.

## Test

1. Copy these files into a new `feature/haptic-language` branch of the hummm repository.
2. Open the GitHub Pages URL on an Android phone over HTTPS.
3. Enable location, press **begin**, and keep the phone in a pocket.
4. Use the new target: `-31.95022, 115.86051`.

The screen remains minimal, but the small debug line is visible during this prototype so GPS and phrase behaviour can be checked. Moving away deliberately produces silence. Arrival plays Relief once and stops tracking.

## Hardware boundary

`playPhrase(name)` is the hardware-independent interface. The default `phoneOutput` uses `navigator.vibrate()`. A future Woojer adapter can replace `output` without changing GPS, distance, or phrase selection.

Serve from HTTPS (GitHub Pages is suitable). Browser vibration support varies by phone and browser; the app gives a short acknowledgement pulse when Begin is pressed.
