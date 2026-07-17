// Wires up navigation, countdown, galleries, and Strava-driven data rendering.
(function () {
  'use strict';

  const GOAL_RACE_DATE = '2027-04-25T09:30:00+01:00'; // approximate London start-line time, BST

  // ---------- Mobile nav ----------
  const navToggle = document.getElementById('navToggle');
  const primaryNav = document.getElementById('primaryNav');
  navToggle?.addEventListener('click', () => {
    const open = primaryNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  primaryNav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
    primaryNav.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
  }));

  // ---------- Countdown ----------
  function tickCountdown() {
    const now = new Date();
    const goal = new Date(GOAL_RACE_DATE);
    let diff = Math.max(0, goal - now);

    const day = 24 * 60 * 60 * 1000;
    const hour = 60 * 60 * 1000;
    const minute = 60 * 1000;

    const days = Math.floor(diff / day); diff -= days * day;
    const hours = Math.floor(diff / hour); diff -= hours * hour;
    const mins = Math.floor(diff / minute); diff -= mins * minute;
    const secs = Math.floor(diff / 1000);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val).padStart(2, '0'); };
    set('cdDays', days);
    set('cdHours', hours);
    set('cdMins', mins);
    set('cdSecs', secs);
  }
  tickCountdown();
  setInterval(tickCountdown, 1000);

  // ---------- Lightbox (photo grid + medals) ----------
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxClose = document.getElementById('lightboxClose');
  let lastFocused = null;

  function openLightbox(src, alt) {
    lastFocused = document.activeElement;
    lightboxImg.src = src;
    lightboxImg.alt = alt || '';
    lightbox.hidden = false;
    lightboxClose.focus();
    document.addEventListener('keydown', onLightboxKeydown);
  }
  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = '';
    document.removeEventListener('keydown', onLightboxKeydown);
    lastFocused?.focus();
  }
  function onLightboxKeydown(e) {
    if (e.key === 'Escape') closeLightbox();
  }
  lightboxClose?.addEventListener('click', closeLightbox);
  lightbox?.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

  document.querySelectorAll('.photo-cell, .medal-cell').forEach((btn) => {
    btn.addEventListener('click', () => {
      const full = btn.getAttribute('data-full');
      const img = btn.querySelector('img');
      openLightbox(full, img?.alt);
    });
  });

  // ---------- Table-view toggles (generic, used by all chart cards) ----------
  document.querySelectorAll('.table-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const target = document.getElementById(targetId);
      if (!target) return;
      const isHidden = target.hasAttribute('hidden');
      if (isHidden) target.removeAttribute('hidden'); else target.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', String(isHidden));
      btn.textContent = isHidden ? 'Hide table' : 'View as table';
    });
  });

  // ---------- Data-driven sections ----------
  function fmtKm(v) { return v.toLocaleString(undefined, { maximumFractionDigits: 1 }); }
  function fmtPace(minPerKm) {
    if (minPerKm == null) return '—';
    const mins = Math.floor(minPerKm);
    const secs = Math.round((minPerKm - mins) * 60);
    return `${mins}:${String(secs).padStart(2, '0')}/km`;
  }
  function fmtMonth(key) {
    const [y, m] = key.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  function fmtWeek(key) {
    return new Date(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function renderStats(payload) {
    const { aggregates, fetched_at } = payload;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('statDistance', fmtKm(aggregates.total_distance_km));
    set('statRuns', aggregates.run_count);
    set('statElevation', Math.round(aggregates.total_elevation_gain_m).toLocaleString());
    set('statLongest', fmtKm(aggregates.longest_run_km));

    const synced = document.getElementById('lastSynced');
    if (synced) {
      synced.textContent = fetched_at
        ? new Date(fetched_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'not yet — run npm run fetch-strava';
    }
  }

  function renderCharts(payload) {
    const { aggregates } = payload;

    // Weekly distance — bar chart
    const weeklyItems = aggregates.weekly.map((w) => ({
      label: `Week of ${fmtWeek(w.week)}`,
      shortLabel: fmtWeek(w.week),
      value: w.distance_km,
    }));
    ChubbyCharts.renderBarChart(
      document.getElementById('weeklyChartMount'),
      document.getElementById('weeklyChartTable'),
      { items: weeklyItems, formatValue: fmtKm, unit: 'km', caption: 'Weekly training distance' }
    );

    // Cumulative distance vs a flat reference line (visual progress marker)
    let running = 0;
    const cumulativeItems = aggregates.weekly.map((w) => {
      running += w.distance_km;
      return { label: `Week of ${fmtWeek(w.week)}`, shortLabel: fmtWeek(w.week), value: Math.round(running * 10) / 10 };
    });
    ChubbyCharts.renderLineChart(
      document.getElementById('progressChartMount'),
      document.getElementById('progressChartTable'),
      {
        items: cumulativeItems,
        formatValue: fmtKm,
        unit: 'km',
        caption: 'Cumulative training distance',
        seriesClass: { line: 'cx-line--distance', area: 'cx-area--distance', dot: 'cx-area--distance' },
      }
    );

    // Monthly elevation gain
    const elevationItems = aggregates.monthly.map((m) => ({
      label: fmtMonth(m.month), shortLabel: fmtMonth(m.month), value: m.elevation_gain_m,
    }));
    ChubbyCharts.renderLineChart(
      document.getElementById('elevationChartMount'),
      document.getElementById('elevationChartTable'),
      {
        items: elevationItems,
        formatValue: (v) => Math.round(v).toLocaleString(),
        unit: 'm',
        caption: 'Monthly elevation gain',
        seriesClass: { line: 'cx-line--elevation', area: 'cx-area--elevation', dot: 'cx-area--elevation' },
      }
    );

    // Monthly average pace
    const paceItems = aggregates.monthly
      .filter((m) => m.avg_pace_min_km != null)
      .map((m) => ({ label: fmtMonth(m.month), shortLabel: fmtMonth(m.month), value: m.avg_pace_min_km }));
    ChubbyCharts.renderLineChart(
      document.getElementById('paceChartMount'),
      document.getElementById('paceChartTable'),
      {
        items: paceItems,
        formatValue: fmtPace,
        unit: '',
        caption: 'Monthly average pace',
        seriesClass: { line: 'cx-line--pace', area: 'cx-area--pace', dot: 'cx-area--pace' },
      }
    );
  }

  async function loadStravaData() {
    try {
      const res = await fetch('data/activities.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`activities.json ${res.status}`);
      const payload = await res.json();
      renderStats(payload);
      renderCharts(payload);
      ChubbyMap.render(payload.activities || []);
    } catch (err) {
      console.error('[chubby.run] could not load Strava data:', err);
      document.querySelectorAll('.chart-mount').forEach((mount) => {
        mount.innerHTML = '<p style="padding:1rem 0;color:var(--ink-muted);font-size:0.9rem;">Training data isn’t available yet — run <code>npm run fetch-strava</code>.</p>';
      });
    }
  }

  loadStravaData();
})();
