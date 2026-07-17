// Pulls the athlete's activities from Strava and writes a static data/activities.json
// that the front-end reads. Run daily (cron / GitHub Actions) — see README.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENV_PATH = join(ROOT, '.env');
const DATA_PATH = join(ROOT, 'data', 'activities.json');

const TRAINING_WINDOW_START = '2026-01-01T00:00:00Z';
const GOAL_RACE_DATE = '2027-04-25'; // TCS London Marathon 2027 (main race day of the two-day event)

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

// Strava rotates the refresh token on every use — persist whatever comes back
// so the next run (tomorrow's cron) still has a valid pair.
function persistTokens({ access_token, refresh_token }) {
  let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const setLine = (content, key, value) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    return re.test(content) ? content.replace(re, line) : `${content}\n${line}`;
  };
  env = setLine(env, 'STRAVA_ACCESS_TOKEN', access_token);
  env = setLine(env, 'STRAVA_REFRESH_TOKEN', refresh_token);
  writeFileSync(ENV_PATH, env.trimStart());
}

async function refreshAccessToken() {
  const client_id = requireEnv('STRAVA_CLIENT_ID');
  const client_secret = requireEnv('STRAVA_CLIENT_SECRET');
  const refresh_token = requireEnv('STRAVA_REFRESH_TOKEN');

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id,
      client_secret,
      grant_type: 'refresh_token',
      refresh_token,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  persistTokens(json);
  return json.access_token;
}

async function fetchAllActivities(accessToken) {
  const after = Math.floor(new Date(TRAINING_WINDOW_START).getTime() / 1000);
  const activities = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=${perPage}&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Activities fetch failed: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    activities.push(...batch);
    if (batch.length < perPage || page > 10) break; // safety cap: 2000 activities
    page += 1;
  }
  return activities;
}

async function fetchAthleteStats(accessToken, athleteId) {
  const res = await fetch(`https://www.strava.com/api/v3/athletes/${athleteId}/stats`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchAthlete(accessToken) {
  const res = await fetch('https://www.strava.com/api/v3/athlete', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Athlete fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function slimActivity(a) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    sport_type: a.sport_type,
    start_date: a.start_date,
    start_date_local: a.start_date_local,
    timezone: a.timezone,
    distance: a.distance, // meters
    moving_time: a.moving_time, // seconds
    elapsed_time: a.elapsed_time,
    total_elevation_gain: a.total_elevation_gain, // meters
    average_speed: a.average_speed, // m/s
    max_speed: a.max_speed,
    average_heartrate: a.average_heartrate ?? null,
    max_heartrate: a.max_heartrate ?? null,
    kudos_count: a.kudos_count,
    workout_type: a.workout_type ?? null,
    start_latlng: a.start_latlng ?? null,
    end_latlng: a.end_latlng ?? null,
    map: a.map?.summary_polyline ? { summary_polyline: a.map.summary_polyline } : null,
  };
}

function buildAggregates(activities) {
  const runs = activities.filter((a) => a.type === 'Run' || a.sport_type === 'Run' || a.sport_type === 'TrailRun');

  const totalDistance = runs.reduce((s, a) => s + a.distance, 0);
  const totalElevation = runs.reduce((s, a) => s + a.total_elevation_gain, 0);
  const totalMovingTime = runs.reduce((s, a) => s + a.moving_time, 0);
  const longestRun = runs.reduce((max, a) => (a.distance > (max?.distance ?? 0) ? a : max), null);

  const byWeek = new Map();
  const byMonth = new Map();
  for (const a of runs) {
    const d = new Date(a.start_date_local ?? a.start_date);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const weekStart = new Date(d);
    const day = (weekStart.getDay() + 6) % 7; // Monday-start week
    weekStart.setDate(weekStart.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);
    const weekKey = weekStart.toISOString().slice(0, 10);

    if (!byMonth.has(monthKey)) byMonth.set(monthKey, { distance: 0, elevation: 0, movingTime: 0 });
    const m = byMonth.get(monthKey);
    m.distance += a.distance;
    m.elevation += a.total_elevation_gain;
    m.movingTime += a.moving_time;

    byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + a.distance);
  }

  const weekly = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, distance]) => ({
    week,
    distance_km: Math.round((distance / 1000) * 10) / 10,
  }));
  const monthly = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, m]) => ({
    month,
    distance_km: Math.round((m.distance / 1000) * 10) / 10,
    elevation_gain_m: Math.round(m.elevation),
    // weighted average pace for the month, minutes per km
    avg_pace_min_km: m.distance > 0 ? Math.round((m.movingTime / 60 / (m.distance / 1000)) * 100) / 100 : null,
  }));

  return {
    run_count: runs.length,
    total_distance_km: Math.round((totalDistance / 1000) * 10) / 10,
    total_elevation_gain_m: Math.round(totalElevation),
    total_moving_time_s: totalMovingTime,
    longest_run_km: longestRun ? Math.round((longestRun.distance / 1000) * 10) / 10 : 0,
    weekly,
    monthly,
  };
}

async function main() {
  console.log('[strava] refreshing access token…');
  const accessToken = await refreshAccessToken();

  console.log('[strava] fetching athlete profile…');
  const athlete = await fetchAthlete(accessToken);

  console.log('[strava] fetching activities…');
  const rawActivities = await fetchAllActivities(accessToken);
  const activities = rawActivities.map(slimActivity).sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

  console.log('[strava] fetching lifetime stats…');
  const stats = await fetchAthleteStats(accessToken, athlete.id);

  const aggregates = buildAggregates(activities);

  const payload = {
    fetched_at: new Date().toISOString(),
    training_window_start: TRAINING_WINDOW_START,
    goal_race_date: GOAL_RACE_DATE,
    athlete: {
      city: athlete.city ?? null,
      state: athlete.state ?? null,
      country: athlete.country ?? null,
    },
    lifetime_stats: stats
      ? {
          recent_run_totals: stats.recent_run_totals,
          ytd_run_totals: stats.ytd_run_totals,
          all_run_totals: stats.all_run_totals,
        }
      : null,
    aggregates,
    activities,
  };

  writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2));
  console.log(`[strava] wrote ${activities.length} activities to ${DATA_PATH}`);
}

main().catch((err) => {
  console.error('[strava] FAILED:', err.message);
  process.exit(1);
});
