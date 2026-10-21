# PLAN: Squall (4 milestones, one per pass)

## M1: Working shell with real data (10-15 minutes)
Vite app, index.html, Apopka hardcoded. Fetches live Open-Meteo forecast and shows the Today hero (current temp, feels like, conditions, rule-based headline) over a condition-aware sky gradient, plus a plain 24-hour rain-chance strip.
Checks:
- [ ] `npm run build` makes dist/ with no errors.
- [ ] Page in headless Chrome at 390x844 shows real current Apopka temperature (matches a direct curl to Open-Meteo).
- [ ] Headline and rain strip render from live data, no console errors.
- [ ] Screenshot proof/m1.png looks premium, not default.

## M2: Rain timeline, dry windows, heat and sun
Scrubbable 24-hour timeline with lightning risk, next-2-hours 15-minute view, dry windows with the five presets and a "why" view, heat index and UV cards, sunrise/sunset/golden hour, 10-day outlook.
Checks:
- [ ] Scrubbing the timeline updates the hour readout.
- [ ] Each preset shows dry windows computed from live data (or an honest "none today").
- [ ] Heat, UV, sun times, and 10-day render with real values.
- [ ] Screenshots proof/m2-*.png pass the taste bar.

## M3: Radar, tropics, alerts, air
RainViewer animated radar on a dark map, api/tropics.js proxying NHC with caching, tropics card with distance and direction from the place, NWS alerts banner, US AQI.
Checks:
- [ ] Radar loop plays and scrubs with timestamps.
- [ ] api/tropics.js returns current NHC storms (tested locally with `vercel dev` or a node test of the handler).
- [ ] Tropics card shows real storms or the calm empty state; alerts banner appears only when NWS has an active alert.
- [ ] Screenshots proof/m3-*.png.

## M4: Places, install, offline, polish
Use my location, place search via Open-Meteo geocoding, saved places with switching, manifest and icons, service worker offline with last-updated time, pull-to-refresh, foreground refresh over 15 minutes, living sky motion (rain, drift, lightning), final polish pass on every screen.
Checks:
- [ ] Searching "Orlando" and saving it switches all cards to Orlando data; reload keeps saved places.
- [ ] Offline reload shows the last data with its timestamp.
- [ ] Manifest and apple-touch-icon valid; standalone layout respects safe areas.
- [ ] Final screenshots proof/m4-*.png all pass the taste bar. Then write READY on its own line in PROGRESS.md.
