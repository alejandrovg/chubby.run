// Predicts marathon finish time from the latest 3 runs using Riegel's formula:
// T2 = T1 * (D2/D1)^1.06 — https://www.omnicalculator.com/sports/race-predictor
// The reveal is animated with an anime.js v4 timeline of sequential timers:
// https://animejs.com/documentation/timeline/add-timers
const ChubbyPredictor = (() => {
  const MARATHON_M = 42195;
  const RIEGEL_EXPONENT = 1.06;

  function fmtHMS(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function riegelPredict(distanceM, movingTimeS) {
    return movingTimeS * Math.pow(MARATHON_M / distanceM, RIEGEL_EXPONENT);
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function fmtPace(distanceM, movingTimeS) {
    const minPerKm = (movingTimeS / 60) / (distanceM / 1000);
    let mins = Math.floor(minPerKm);
    let secs = Math.round((minPerKm - mins) * 60);
    if (secs === 60) { secs = 0; mins += 1; }
    return `${mins}:${String(secs).padStart(2, '0')}/km`;
  }

  function buildRunList(runs, predictions) {
    const list = document.getElementById('predictorRuns');
    list.replaceChildren();
    runs.forEach((r, i) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'predictor-run-name';
      name.textContent = `${r.name} · ${fmtDate(r.start_date_local ?? r.start_date)}`;
      const meta = document.createElement('span');
      meta.className = 'predictor-run-meta';
      meta.textContent = `${(r.distance / 1000).toFixed(1)} km @ ${fmtPace(r.distance, r.moving_time)} → ${fmtHMS(predictions[i])}`;
      li.appendChild(name);
      li.appendChild(meta);
      list.appendChild(li);
    });
  }

  // Sequentially reveals each contributing run's individual Riegel projection,
  // then settles on the averaged final prediction — built as a chain of
  // timeline timers (duration + onUpdate/onComplete), per anime.js v4 docs.
  async function animateReveal(sequence) {
    const el = document.getElementById('predictorTime');
    // Show the correct final value immediately — the animation below is a
    // progressive enhancement layered on top, never the thing correctness relies on.
    const finalSeconds = sequence[sequence.length - 1];
    el.textContent = fmtHMS(finalSeconds);

    try {
      const { createTimeline } = await import('https://cdn.jsdelivr.net/npm/animejs@4/+esm');
      const state = { seconds: sequence[0] ?? 0 };
      el.textContent = fmtHMS(state.seconds);

      const tl = createTimeline({ autoplay: true });
      sequence.forEach((targetSeconds, i) => {
        tl.add(
          state,
          {
            seconds: targetSeconds,
            duration: i === sequence.length - 1 ? 900 : 420,
            ease: 'outQuad',
            onUpdate: () => { el.textContent = fmtHMS(state.seconds); },
          },
          i === 0 ? 0 : '+=180'
        );
      });
    } catch (err) {
      // Animation is a nice-to-have; the number itself must always land correctly.
      console.warn('[chubby.run] predictor animation unavailable, showing final value directly', err);
      el.textContent = fmtHMS(sequence[sequence.length - 1] ?? 0);
    }
  }

  function render(payload) {
    const note = document.getElementById('predictorNote');
    if (!note) return; // predictor card isn't on this page — nothing to render

    const runs = (payload.activities || [])
      .filter((a) => a.type === 'Run' || a.sport_type === 'Run')
      .filter((a) => a.distance >= 1000) // ignore very short/GPS-noise entries
      .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
      .slice(0, 3);

    if (!runs.length) {
      note.textContent = 'No qualifying runs since January 2026 yet — log a run to get a prediction.';
      return;
    }

    const predictions = runs.map((r) => riegelPredict(r.distance, r.moving_time));
    const finalPrediction = predictions.reduce((s, v) => s + v, 0) / predictions.length;

    const revealSequence = [...predictions.slice().reverse(), finalPrediction];
    animateReveal(revealSequence);

    note.textContent = runs.length === 1
      ? 'Based on your only qualifying run — more runs will sharpen this estimate.'
      : `Averaged from your last ${runs.length} runs, projected to marathon distance (42.195 km) via Riegel's formula.`;

    buildRunList(runs, predictions);
  }

  return { render };
})();
