# Megatree v3 build viewer

A 3D, step-by-step erection sequence for the Megatree v3, built from the Fusion model.
Orbit, pan and zoom the scene, scrub through the 16 steps, and drop a satellite view of the yard underneath.

## Run it

It is a static site with no build step and no external runtime dependencies (three.js is in `vendor/`).

```sh
npx http-server -p 8080 .     # or: python3 -m http.server 8080
```

Open http://localhost:8080. Opening `index.html` straight from disk won't work, because browsers block module and model loads from `file://`.

To host it: Settings → Pages → deploy from branch, root folder.

## Controls

- Drag to orbit. Right-drag or two-finger drag to pan. Scroll or pinch to zoom.
- Space plays and pauses. ← and → move between steps. Click any step to jump to it.
- Moving the camera turns off **Follow cam**. Click it to turn it back on.
- Hover any part to see its Fusion name.

## Satellite view

Open **Site**:
1. Paste the NB50 stub's location as `lat, lon`. Right-click the spot in Google Maps to copy it.
2. Click **Load satellite**. The imagery is Esri World Imagery.
3. Turn **House direction** until the house in the imagery sits behind the pole. This is the compass bearing of Fusion +Y.
4. **Click stub on map** fine-tunes the position.

**Copy link with site** puts these settings in the URL. They are also remembered in the browser.
If the Esri tiles are poor, use **Use my own aerial photo** with a known metres-per-pixel scale (e.g. from Nearmap).

**Move imagery** lets you drag the satellite or photo into place. Shift-drag rotates it about the stub. Right-drag and scroll still move the camera.
An uploaded photo, with its position, rotation and scale, is saved in that browser (IndexedDB) and restored on the next visit.

To make a placed photo permanent for everyone:
1. Click **Copy placement**.
2. Commit the photo into `site/` and make `photo.src` match its file name.
3. Put the copied values into `SITE` in `js/config.js` (`photo`, `houseBearing`, and `lat`/`lon` if present).

A photo or satellite view someone places in their own browser still overrides the committed one for them.

## Updating from Fusion

1. Re-run the Fusion export script into `fusion-export/` (STEP, per-body OBJ, `joints.json`, `manifest.json`).
2. Run `python3 tools/build_model.py`. It regenerates `model/megatree.json` and `model/megatree.bin`.

The OBJs are in each occurrence's local frame, so the build reads the occurrence placements from the STEP file.
That also restores the second topper carriage: both instances were exported to the same file name.

Steps, timings, camera positions, the sawhorse position and pixels per string are set in `js/config.js`.
Joint values there use Fusion's units and signs (hinge °, sliders mm).

## Not from the Fusion model

- **Sawhorse.** Drawn at 600 high and 3 m out, from the build notes.
- **Pixels per string.** Defaults to 50. It isn't in the export, so set `LIGHTS.pixelsPerString` to the real count.
- **String sag and slack.** A rope simulation, pinned at the topper and the base ring.
- **Winch crank speed and cable route.** Approximate. The cable follows the "Cable @ park" sketch, simplified.
- **Fit order before the walk-up.** Bracket, then collar, then topper, all slid on from the top. This is inferred from the parts, not from the manual.
