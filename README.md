# hummm — Redfern Field

An experiment for finding living systems within the concrete jungle around Carriageworks Way, Redfern.

## Version 0.6.4 — Redfern Field

- Uses phone GPS and a bundled City of Sydney tree inventory around Carriageworks Way and Wilson Street.
- Builds a nearby living field from individual tree position, canopy, maturity, trunk diameter and species.
- Translates the field into four clearly separate haptic states: concrete pressure, threshold, living field and contact.
- Shows an on-device GPS coordinate and accuracy at the bottom of the field for documenting walks.
- Location stays in the browser; it is not transmitted or stored.

Initial test data: City of Sydney tree inventory, filtered to the Redfern/Carriageworks area. Coordinates are evaluated locally in the browser and are not transmitted or stored.

## Woojer testing

Pair the Woojer Strap 4 to the test phone and make it the active Bluetooth audio output before opening the field. The browser generates low-frequency audio pulses and the phone sends them to the currently selected Bluetooth output, which the Woojer translates into touch.

Open the prototype on a phone over HTTPS, allow location access, then press **begin field walk**. Move slowly and keep your attention on traffic and the street. The field changes as GPS position changes; press **stop** to end the walk.

The field is deliberately not a route to one tree. Concrete is a sparse, machine-like low hum that gently ebbs and flows; threshold interrupts it with a deeper call; living field becomes a three-part rhythm; and contact is a fuller, ritualised response. The states now have different timing as well as intensity, so they should read distinctly through the Woojer.

Research question: **Can a living haptic language both guide and move a human wayfinder?**

Design principles: Human Wayfinding; Trust before autonomy; Rhythm is language; Silence is productive; Places express themselves; Wayfinders respond through movement; Arrival is joy not achievement.

## Test

1. Open the GitHub Pages URL on an iPhone or Android phone over HTTPS.
2. Pair the Woojer and select it as the phone's audio output.
3. Allow location access and begin the field walk. If supported on the phone, the app asks the screen to stay awake during the test.
4. Test around Carriageworks Way, Wilson Street and the surrounding Redfern field. Do not rely on the prototype for safety or navigation around traffic.

The screen remains minimal, but the GPS coordinate, accuracy and small debug line make screenshots auditable during testing.

## Hardware boundary

`readField(latitude, longitude)` provides the local ecological reading, while `playFieldCycle()` renders it through Web Audio. A future wearable adapter or richer procedural generator can replace the rendering layer without changing the field calculation.

Serve from HTTPS (GitHub Pages is suitable). On iPhone, a web page cannot continue generating browser audio or GPS updates after the device is actually locked. The best browser-level option is the Screen Wake Lock request included here; for a true locked-screen experience, the work would need a native iOS app with background audio and location capabilities.
