# Release notes — Build 001b: Haptic Field

**Purpose:** test whether a continuous haptic field can support wayfinding toward a hidden location.

- Initial target: `-31.94915, 115.85944`.
- Minimal start screen and pocket-first experience.
- Haptic feedback begins after the first GPS reading and continues throughout the search.
- The haptic field reaches beyond 400 metres: the rhythm becomes more frequent as the participant nears the target.
- Direction prompts compare movement every 3.5 seconds: `keep going.` or `try another way.` appears briefly, then returns to `move. pay attention.`
- Arrival requires two accurate GPS readings within 12 metres, reducing false arrivals.
- One long pulse marks arrival, followed by silence.
- Includes a web manifest and offline cache for GitHub Pages installation/testing.
- Handles denied, unavailable, and slow location access with plain-language recovery messages.

Not included: map selection, distance readout, data layers, target list, Woojer audio output, or participant logging. Those are deliberately outside this test.
