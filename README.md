# hummm — Haptic Composer

An experiment for composing and comparing tactile states before they are used in a navigation walk.

## Version 0.2 — Heartbeat Evolution

- One continuous **far → close** control rather than discrete states.
- The slider smoothly interpolates tempo, strength, pause, irregularity, density, and low-frequency pitch.
- A loop toggle and stop control.
- Visual design carried across from the hummm navigation prototype.

## Woojer testing

Pair the Woojer Strap 4 to the test phone and make it the active Bluetooth audio output before opening the composer. Each state generates low-frequency Web Audio pulses in the browser. The phone sends that audio to the currently selected output device, which the Woojer translates into touch.

Move the slider and press **feel the rhythm** to play the current expression once. Turn on **loop** to keep the engine alive while you explore the slider; it reschedules the next beat using the new values each time the relationship changes. Press **stop** to end it.

This build removes named haptic phrases in favour of a relationship value, expressed as a continuously evolving tactile rhythm.

Research question: **Can a living haptic language both guide and move a human wayfinder?**

Design principles: Human Wayfinding; Trust before autonomy; Rhythm is language; Silence is productive; Places express themselves; Wayfinders respond through movement; Arrival is joy not achievement.

## Test

1. Open the GitHub Pages URL on an Android phone over HTTPS.
2. Pair the Woojer and select it as the phone's audio output.
3. Start at **far** and move the slider towards **close**, listening for the moment it changes from calm to urgent.

The screen remains minimal, but the small debug line is visible during this prototype so Bluetooth output can be checked.

## Hardware boundary

`getEvolutionParameters(value)` provides the current haptic expression, while `playEvolution()` renders it through Web Audio. A future Woojer adapter or richer procedural generator can replace the rendering layer without changing the relationship control.

Serve from HTTPS (GitHub Pages is suitable). Browser vibration support varies by phone and browser; the app gives a short acknowledgement pulse when Begin is pressed.
