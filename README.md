# hummm — Marrickville Field

An experiment for finding living systems within the concrete jungle of Marrickville.

## Version 0.4 — Marrickville Field

- Uses phone GPS and a bundled local slice of mapped Marrickville green-space features.
- Builds a nearby living field from parks, gardens, tree rows and wooded areas.
- Translates that field into a concrete interference pattern and a layered living call.
- Location stays in the browser; it is not transmitted or stored.

Initial test data: OpenStreetMap mapped green-space features, filtered to Marrickville. This is deliberately a rapid field test rather than a complete local tree inventory; it is used only to create the local haptic field.

## Woojer testing

Pair the Woojer Strap 4 to the test phone and make it the active Bluetooth audio output before opening the field. The browser generates low-frequency audio pulses and the phone sends them to the currently selected Bluetooth output, which the Woojer translates into touch.

Open the prototype on a phone over HTTPS, allow location access, then press **begin field walk**. Move slowly and keep your attention on traffic and the street. The field changes as GPS position changes; press **stop** to end the walk.

The field is deliberately not a route to one tree. Concrete remains a forceful, uneven presence; clusters of canopy introduce deeper, more varied rhythms. At high ecological density, the system moves into **contact** — a more insistent, ritualised response.

Research question: **Can a living haptic language both guide and move a human wayfinder?**

Design principles: Human Wayfinding; Trust before autonomy; Rhythm is language; Silence is productive; Places express themselves; Wayfinders respond through movement; Arrival is joy not achievement.

## Test

1. Open the GitHub Pages URL on an Android phone over HTTPS.
2. Pair the Woojer and select it as the phone's audio output.
3. Allow location access and begin the field walk.
4. Test within the Marrickville field. Do not rely on the prototype for safety or navigation around traffic.

The screen remains minimal, but the small debug line shows the live field calculation and GPS accuracy for testing.

## Hardware boundary

`readField(latitude, longitude)` provides the local ecological reading, while `playFieldCycle()` renders it through Web Audio. A future wearable adapter or richer procedural generator can replace the rendering layer without changing the field calculation.

Serve from HTTPS (GitHub Pages is suitable). Browser vibration support varies by phone and browser; the app gives a short acknowledgement pulse when Begin is pressed.
