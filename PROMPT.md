# Squall: Tara's daily sky (overnight build 2026-10-17)

## The ask (the floor, never narrow it)
Tara's standing order: a useful everyday app she'll open daily, like Night Shelf (her most-used app). Not a game, sim, or toy, and not a repeat of what she has (Night Shelf, Restock, Subscription Sleuth, Return Window, Upkeep, Launch Day, Mind Map Live). Taste is a hard bar: beautiful and premium, never default-looking.

## What to build
Squall is a gorgeous, phone-first web app that answers the questions a Central Florida day actually turns on: "When will it rain today?", "When's my dry window to walk, run errands, or mow?", "How bad is the heat?", "Is anything brewing in the tropics?" Home is Apopka, FL (28.6934, -81.5322, America/New_York), with "use my location" and saved places.

Real, live data only. Never sample, placeholder, or made-up data. If a source fails, say so plainly in the UI and show the time of the last good data.
- Forecast: Open-Meteo (https://api.open-meteo.com/v1/forecast, free, no key, CORS ok). Hourly and 15-minute precipitation probability and amount, temperature, apparent temperature (feels like), humidity, dew point, wind and gusts, cloud cover, CAPE / lightning potential, UV index, weather codes, sunrise and sunset, 10-day daily. Use Fahrenheit, mph, inches.
- Air: Open-Meteo air quality (https://air-quality-api.open-meteo.com/v1/air-quality): US AQI, UV.
- Alerts: NWS (https://api.weather.gov/alerts/active?point=LAT,LON), shown loud only when one is active.
- Radar: RainViewer public API (https://api.rainviewer.com/public/weather-maps.json) animated radar loop over a dark map (Leaflet or MapLibre with a tasteful dark basemap), centered on the place.
- Tropics: NHC active storms (https://www.nhc.noaa.gov/CurrentStorms.json, no CORS, so proxy it through a small Vercel serverless function in api/ with Cache-Control s-maxage=900). Show active Atlantic storms with name, category, distance and direction from Apopka, and a calm "Quiet in the Atlantic" state when none. Hurricane season is June 1 to Nov 30.

## Features
1. Today hero: one plain-language headline written from the data by deterministic rules (no AI calls), e.g. "Dry until 3pm, then storms likely through 6." Big current temp and feels like, a living sky background that matches the real conditions and time of day (dawn, midday, storm, night).
2. Rain timeline: a beautiful scrubbable 24-hour strip (rain chance and amount, lightning risk), plus a "next 2 hours" minute-ish view from 15-minute data.
3. Dry windows: the best blocks today and tomorrow for outdoor plans, with presets (walk, errands, mow the lawn, laundry on the line, grill) and simple rules per preset (rain, heat index, wind, daylight). Tap a window to see why.
4. Heat and sun: heat index band with plain advice, UV with burn time, sunrise and sunset, golden hour.
5. Radar: animated loop with play, scrub, and timestamps.
6. Tropics card and NWS alerts.
7. 10-day outlook that reads well at a glance.
8. Places: Apopka by default, "use my location", search any place (Open-Meteo geocoding API), saved places in localStorage, swipe or tap to switch.
9. Installable on iPhone home screen (manifest, icons, apple-touch-icon, standalone, safe areas, dark status bar). Works offline with the last data and its timestamp.
10. No background polling of Vercel. Fetch on open, on pull-to-refresh, and when the app returns to the foreground if the data is over 15 minutes old. Weather APIs are called from the browser directly; only NHC goes through the cached Vercel function.

## Taste bar (ship gate)
Premium, distinct, calm. Think a high-end native iOS weather app, but with its own identity: rich layered sky gradients that shift with real conditions, soft glass cards, one confident display typeface plus a clean text face, generous spacing, subtle motion (rain, cloud drift, lightning flicker on storm days) that never stutters. Not default-looking, not a dashboard of gray boxes, not a copy of the Upkeep or Night Shelf look. Only urgent things (an active warning, a storm in the tropics headed this way) are loud. Must look stunning at 390x844 and fine on desktop.

## Build rules
- Static site that builds to dist/ (Vite fine) with api/ functions, deployable on Vercel. No API keys needed. Do not call any paid API or the xAI API.
- No ponytail, eng-bar, YAGNI, or small-diff limits. Do not load those skills. Ambition is welcome.
- Prove every milestone in a real headless Chrome at 390x844 with screenshots in proof/, and look at them.
