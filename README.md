# hummm — Build 001: Haptic Compass

This small field-test app asks one question: can a person navigate toward a hidden place through haptic feedback alone?

## Publish it

1. Unzip this download.
2. Upload the **contents** of this folder to the root of the `pvi-collective/hummm` GitHub repository, replacing its current files if prompted.
3. Commit the changes. GitHub Pages will update at `https://pvi-collective.github.io/hummm/` within a minute or two.
4. Open that address on an Android phone using Chrome. Allow location access, press **Start**, and put the phone in a pocket.

Do not run the app from Google Drive or by opening `index.html` directly: GPS needs the secure GitHub Pages address.

## Target location

The current hidden target is:

```js
const TARGET = { lat: -31.94915, lng: 115.85944 };
```

To set a new target, change that one line near the top of `app.js`, then upload the updated file to GitHub.

## Haptic behaviour

The first GPS reading establishes a baseline. Every few seconds, the app checks whether the participant has moved at least five metres closer or farther away:

- closer: one to four short pulses, with more pulses for stronger progress or close range;
- farther away: silence;
- within roughly 12 m (or current GPS accuracy, if larger): one long arrival pulse, then silence.

The app intentionally gives no map, direction, distance number, or target name.

## Important limitations

- Browser vibration (`navigator.vibrate`) is generally supported on Android Chrome. iPhones and iPads do not provide it to web pages.
- This first build drives the **phone** only. A Woojer Strap paired as Bluetooth audio needs a later build that creates low-frequency audio pulses in the browser.
- GPS accuracy can worsen around tall buildings. The arrival radius automatically allows for the phone's reported uncertainty.
