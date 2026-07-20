# Release notes — Build 001: Haptic Compass

**Purpose:** test whether rhythmic haptics can reward progress toward a hidden location.

- Initial target: `-31.94915, 115.85944`.
- Minimal start screen and pocket-first experience.
- GPS progress feedback: more rhythmic pulses for meaningful movement toward the target; silence when movement is away from it.
- One long pulse marks arrival, followed by silence.
- Includes a web manifest and offline cache for GitHub Pages installation/testing.
- Handles denied, unavailable, and slow location access with plain-language recovery messages.

Not included: map selection, distance readout, data layers, target list, Woojer audio output, or participant logging. Those are deliberately outside this test.
