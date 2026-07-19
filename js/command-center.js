// Command Center page: mobile nav, countdown clock, and the manual
// "refresh Strava data" button (calls the trigger-refresh.php proxy,
// which securely kicks off the GitHub Actions daily-refresh workflow).
(function () {
  'use strict';

  const GOAL_RACE_DATE = '2027-04-25T09:30:00+01:00';

  const navToggle = document.getElementById('navToggle');
  const primaryNav = document.getElementById('primaryNav');
  navToggle?.addEventListener('click', () => {
    const open = primaryNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
  });

  function tickCountdown() {
    const now = new Date();
    let diff = Math.max(0, new Date(GOAL_RACE_DATE) - now);
    const day = 86400000, hour = 3600000, minute = 60000;
    const days = Math.floor(diff / day); diff -= days * day;
    const hours = Math.floor(diff / hour); diff -= hours * hour;
    const mins = Math.floor(diff / minute); diff -= mins * minute;
    const secs = Math.floor(diff / 1000);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v).padStart(2, '0'); };
    set('cdDays', days); set('cdHours', hours); set('cdMins', mins); set('cdSecs', secs);
  }
  tickCountdown();
  setInterval(tickCountdown, 1000);

  // ---------- Scroll-reveal (anime.js) ----------
  // Panels fade/slide into view as they cross the viewport — same anime.js
  // v4 build used by the predictor card's timeline.
  (async () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try {
      const { animate } = await import('https://cdn.jsdelivr.net/npm/animejs@4/+esm');
      const targets = document.querySelectorAll('.cc-panel-label, .cc-refresh-panel');
      targets.forEach((el) => { el.style.opacity = '0'; });

      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animate(entry.target, {
            opacity: [0, 1],
            translateY: [16, 0],
            duration: 520,
            ease: 'outCubic',
          });
          io.unobserve(entry.target);
        });
      }, { threshold: 0.15 });

      targets.forEach((el) => io.observe(el));
    } catch (err) {
      console.warn('[chubby.run] scroll-reveal animation unavailable', err);
      document.querySelectorAll('.cc-panel-label, .cc-refresh-panel').forEach((el) => { el.style.opacity = '1'; });
    }
  })();

  // ---------- Refresh button ----------
  const btn = document.getElementById('refreshBtn');
  const status = document.getElementById('refreshStatus');
  const dot = document.getElementById('statusDot');

  btn?.addEventListener('click', async () => {
    btn.disabled = true;
    btn.classList.add('is-loading');
    dot?.classList.add('is-syncing');
    dot?.classList.remove('is-error');
    status.textContent = 'Triggering Strava re-sync…';

    try {
      const res = await fetch('trigger-refresh.php', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      status.textContent = 'Sync triggered — new data lands in about 1–2 minutes. Reload the page after that.';
    } catch (err) {
      console.error('[chubby.run] refresh trigger failed:', err);
      dot?.classList.add('is-error');
      status.textContent = 'Could not trigger a refresh right now — please try again shortly.';
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      dot?.classList.remove('is-syncing');
    }
  });
})();
