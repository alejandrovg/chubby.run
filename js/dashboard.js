// Dashboards page: run/walk breakdown, recent activity table, reused
// chart-cards and predictor-card driven by the same daily Strava data.
(function () {
  'use strict';

  const navToggle = document.getElementById('navToggle');
  const primaryNav = document.getElementById('primaryNav');
  navToggle?.addEventListener('click', () => {
    const open = primaryNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
  });

  document.querySelectorAll('.table-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.getAttribute('data-target'));
      if (!target) return;
      const isHidden = target.hasAttribute('hidden');
      if (isHidden) target.removeAttribute('hidden'); else target.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', String(isHidden));
      btn.textContent = isHidden ? 'Hide table' : 'View as table';
    });
  });

  function fmtKm(v) { return v.toLocaleString(undefined, { maximumFractionDigits: 1 }); }
  function fmtDate(iso) { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function fmtDuration(s) {
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  function fmtPaceMinKm(minPerKm) {
    if (!isFinite(minPerKm)) return '—';
    let mins = Math.floor(minPerKm);
    let secs = Math.round((minPerKm - mins) * 60);
    if (secs === 60) { secs = 0; mins += 1; }
    return `${mins}:${String(secs).padStart(2, '0')}/km`;
  }
  function fmtMonth(key) {
    const [y, m] = key.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  function fmtWeek(key) { return new Date(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

  function typeBreakdown(activities, type) {
    const items = activities.filter((a) => a.type === type || a.sport_type === type);
    const distance = items.reduce((s, a) => s + a.distance, 0);
    const time = items.reduce((s, a) => s + a.moving_time, 0);
    const avgPaceMinKm = distance > 0 ? (time / 60) / (distance / 1000) : NaN;
    return { count: items.length, distanceKm: distance / 1000, avgPaceMinKm };
  }

  function renderBreakdown(activities) {
    const run = typeBreakdown(activities, 'Run');
    const walk = typeBreakdown(activities, 'Walk');
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('dashRunCount', run.count);
    set('dashRunDistance', fmtKm(run.distanceKm));
    set('dashRunPace', fmtPaceMinKm(run.avgPaceMinKm));
    set('dashWalkCount', walk.count);
    set('dashWalkDistance', fmtKm(walk.distanceKm));
    set('dashWalkPace', fmtPaceMinKm(walk.avgPaceMinKm));
  }

  function renderRecentActivityTable(activities) {
    const wrap = document.getElementById('recentActivityTable');
    const runsAndWalks = activities
      .filter((a) => ['Run', 'Walk'].includes(a.type) || ['Run', 'Walk'].includes(a.sport_type))
      .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
      .slice(0, 15);

    if (!runsAndWalks.length) {
      wrap.textContent = 'No run or walk activities logged since January 2026 yet.';
      return;
    }

    const columnLabels = ['Date', 'Type', 'Name', 'Distance (km)', 'Time', 'Pace'];
    const table = document.createElement('table');
    table.className = 'activity-log-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    columnLabels.forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    runsAndWalks.forEach((a) => {
      const tr = document.createElement('tr');
      const paceMinKm = (a.moving_time / 60) / (a.distance / 1000);
      const cells = [
        fmtDate(a.start_date_local ?? a.start_date),
        a.type,
        a.name,
        fmtKm(a.distance / 1000),
        fmtDuration(a.moving_time),
        fmtPaceMinKm(paceMinKm),
      ];
      cells.forEach((c, i) => {
        const td = document.createElement('td');
        td.textContent = c;
        td.setAttribute('data-label', columnLabels[i]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.replaceChildren(table);
  }

  function renderTimeHeatmap(activities) {
    const wrap = document.getElementById('heatmapTable');
    const runsAndWalks = activities.filter((a) => ['Run', 'Walk'].includes(a.type) || ['Run', 'Walk'].includes(a.sport_type));
    if (!runsAndWalks.length) {
      wrap.textContent = 'No run or walk activities logged since January 2026 yet.';
      return;
    }

    // grid[hour][dayOfWeek], dayOfWeek 0=Sun..6=Sat, to match the reference layout
    const grid = Array.from({ length: 24 }, () => Array(7).fill(0));
    let max = 0;
    runsAndWalks.forEach((a) => {
      const d = new Date(a.start_date_local ?? a.start_date);
      const hour = d.getHours();
      const day = d.getDay();
      grid[hour][day] += 1;
      if (grid[hour][day] > max) max = grid[hour][day];
    });

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hourLabel = (h) => {
      const period = h < 12 ? 'AM' : 'PM';
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      return `${displayHour}:00 ${period}`;
    };

    const table = document.createElement('table');
    table.className = 'heatmap-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Start time', ...dayLabels].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    grid.forEach((row, hour) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = hourLabel(hour);
      tr.appendChild(th);
      row.forEach((count, day) => {
        const td = document.createElement('td');
        if (count > 0) {
          const intensity = 0.18 + 0.72 * (count / max);
          td.style.backgroundColor = `rgba(252, 76, 2, ${intensity.toFixed(2)})`;
          if (intensity > 0.55) td.style.color = '#fff';
          td.textContent = count;
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.replaceChildren(table);
  }

  function renderCharts(payload) {
    const { aggregates } = payload;

    const weeklyItems = aggregates.weekly.map((w) => ({
      label: `Week of ${fmtWeek(w.week)}`, shortLabel: fmtWeek(w.week), value: w.distance_km,
    }));
    ChubbyCharts.renderBarChart(
      document.getElementById('weeklyChartMount'), document.getElementById('weeklyChartTable'),
      { items: weeklyItems, formatValue: fmtKm, unit: 'km', caption: 'Weekly training distance' }
    );

    let running = 0;
    const cumulativeItems = aggregates.weekly.map((w) => {
      running += w.distance_km;
      return { label: `Week of ${fmtWeek(w.week)}`, shortLabel: fmtWeek(w.week), value: Math.round(running * 10) / 10 };
    });
    ChubbyCharts.renderLineChart(
      document.getElementById('progressChartMount'), document.getElementById('progressChartTable'),
      {
        items: cumulativeItems, formatValue: fmtKm, unit: 'km', caption: 'Cumulative training distance',
        seriesClass: { line: 'cx-line--distance', area: 'cx-area--distance', dot: 'cx-area--distance' },
      }
    );

    const elevationItems = aggregates.monthly.map((m) => ({ label: fmtMonth(m.month), shortLabel: fmtMonth(m.month), value: m.elevation_gain_m }));
    ChubbyCharts.renderLineChart(
      document.getElementById('elevationChartMount'), document.getElementById('elevationChartTable'),
      {
        items: elevationItems, formatValue: (v) => Math.round(v).toLocaleString(), unit: 'm', caption: 'Monthly elevation gain',
        seriesClass: { line: 'cx-line--elevation', area: 'cx-area--elevation', dot: 'cx-area--elevation' },
      }
    );

    const paceItems = aggregates.monthly.filter((m) => m.avg_pace_min_km != null)
      .map((m) => ({ label: fmtMonth(m.month), shortLabel: fmtMonth(m.month), value: m.avg_pace_min_km }));
    ChubbyCharts.renderLineChart(
      document.getElementById('paceChartMount'), document.getElementById('paceChartTable'),
      {
        items: paceItems, formatValue: fmtPaceMinKm, unit: '', caption: 'Monthly average pace',
        seriesClass: { line: 'cx-line--pace', area: 'cx-area--pace', dot: 'cx-area--pace' },
      }
    );
  }

  async function load() {
    try {
      const res = await fetch('data/activities.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`activities.json ${res.status}`);
      const payload = await res.json();
      const activities = payload.activities || [];

      const synced = document.getElementById('lastSynced');
      if (synced) {
        synced.textContent = payload.fetched_at
          ? new Date(payload.fetched_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          : 'not yet — run npm run fetch-strava';
      }

      renderBreakdown(activities);
      renderTimeHeatmap(activities);
      renderRecentActivityTable(activities);
      renderCharts(payload);
      ChubbyMap.render(activities);
      ChubbyPredictor.render(payload);
    } catch (err) {
      console.error('[chubby.run] dashboards: could not load Strava data:', err);
      document.querySelectorAll('.chart-mount').forEach((mount) => {
        mount.innerHTML = '<p style="padding:1rem 0;color:var(--ink-muted);font-size:0.9rem;">Training data isn’t available yet — run <code>npm run fetch-strava</code>.</p>';
      });
    }
  }

  load();
})();
