# chubby.run

A static, responsive site tracking one runner's training progress toward the
**2027 TCS London Marathon** (24–25 April 2027) — countdown, mileage/elevation/pace
charts, an interactive route map, a photo grid, and a medal gallery. Training data
is pulled from the Strava API and refreshed daily.

## Structure

```
index.html            Page markup
css/styles.css         Design system + responsive layout
js/main.js              Nav, countdown, lightbox, wires data into charts/map
js/charts.js            Dependency-free SVG bar/line charts
js/map.js                Leaflet route map (decodes Strava's polylines)
js/polyline.js           Google/Strava encoded-polyline decoder
scripts/fetch-strava.js  Pulls activities from Strava, writes data/activities.json
scripts/serve.js         Local static file server (blocks .env/scripts/etc.)
data/activities.json     Generated data file the front-end reads (content changes daily)
assets/                  Web-optimized copies of logos/gallery/medals + favicon set
.github/workflows/       Daily GitHub Actions cron to refresh Strava data
```

## Local setup

```bash
npm install
npm run fetch-strava   # pulls fresh data into data/activities.json
npm run serve          # http://localhost:8080
```

## Strava credentials

Stored in `.env` (git-ignored, never committed, never sent to the browser):

```
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_ACCESS_TOKEN=...
STRAVA_REFRESH_TOKEN=...
```

`fetch-strava.js` refreshes the access token on every run and rewrites `.env`
with whatever Strava returns (Strava has not been rotating the refresh token in
testing, but the script handles it either way).

**Required OAuth scope:** the token must include `activity:read_all` (the
default `read` scope Strava grants on first authorization is not enough — the
activities endpoint will 401 with `activity:read_permission missing`). If you
ever need to re-authorize, visit:

```
https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost&response_type=code&approval_prompt=force&scope=read,activity:read_all
```

then exchange the returned `code` for tokens via `POST https://www.strava.com/oauth/token`.

## Daily refresh

`.github/workflows/refresh-strava.yml` runs `npm run fetch-strava` every day at
07:00 UTC and commits the updated `data/activities.json`. To enable it once this
repo is pushed to GitHub:

1. Push this repo to GitHub.
2. In repo Settings → Secrets and variables → Actions, add:
   `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_ACCESS_TOKEN`, `STRAVA_REFRESH_TOKEN`
   (copy the current values from your local `.env`).
3. The workflow also supports manual runs via the "Run workflow" button.

If you'd rather refresh from your own machine instead of GitHub Actions, add a
local cron entry:

```
0 7 * * * cd /path/to/chubby.run && npm run fetch-strava
```

## Deploying

The site is fully static (`index.html` + `css/` + `js/` + `assets/` + `data/`)
— any static host works (Netlify, Vercel, GitHub Pages, S3, etc.). Do **not**
deploy the `.env` file, `scripts/`, `logos/`, or `gallery/` (raw) directories —
only what `scripts/serve.js` allow-lists is meant to be public; configure your
host's publish directory / ignore rules the same way.

## Editing content

Replace the two `[Editable placeholder]` paragraphs and the `about-facts` list
in `index.html`'s About section with the athlete's real bio, goal time, and
story. Everything else (stats, charts, map, gallery, medals) is either data-driven
or reads directly from the `assets/` folders.
