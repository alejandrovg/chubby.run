// Hand-rolled, dependency-free SVG charts (bar + line) with hover tooltips,
// keyboard focus support, and a table-view accessibility twin for each chart.
const ChubbyCharts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const VB_W = 640;

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function niceMax(value) {
    if (value <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const residual = value / magnitude;
    let step;
    if (residual <= 1) step = 1;
    else if (residual <= 2) step = 2;
    else if (residual <= 5) step = 5;
    else step = 10;
    return step * magnitude;
  }

  function roundedTopBarPath(x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, w / 2, h));
    if (h <= 0) return '';
    return `M${x},${y + h} L${x},${y + rad} Q${x},${y} ${x + rad},${y} L${x + w - rad},${y} Q${x + w},${y} ${x + w},${y + rad} L${x + w},${y + h} Z`;
  }

  function linePath(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  }

  function areaPath(points, baseline) {
    if (!points.length) return '';
    const top = linePath(points);
    return `${top} L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z`;
  }

  function ensureTooltip(container) {
    let tip = container.querySelector('.cx-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'cx-tooltip';
      tip.setAttribute('role', 'status');
      container.appendChild(tip);
    }
    return tip;
  }

  // value/label are always produced by our own formatValue()/template-literal calls
  // below (numbers + fixed strings) — never raw API text — so this stays innerHTML-safe.
  function showTooltip(tip, x, y, html) {
    tip.innerHTML = html;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.classList.add('is-visible');
  }

  function hideTooltip(tip) {
    tip.classList.remove('is-visible');
  }

  function buildTable(wrapEl, { caption, columns, rows }) {
    wrapEl.replaceChildren();
    const table = document.createElement('table');
    const cap = document.createElement('caption');
    cap.textContent = caption;
    table.appendChild(cap);
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    columns.forEach((c) => {
      const th = document.createElement('th');
      th.textContent = c;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      r.forEach((cell) => {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapEl.appendChild(table);
  }

  function emptyState(mount, message) {
    const svg = svgEl('svg', { viewBox: `0 0 ${VB_W} 160` });
    const text = svgEl('text', { x: VB_W / 2, y: 84, 'text-anchor': 'middle', class: 'cx-empty' });
    text.textContent = message;
    svg.appendChild(text);
    mount.replaceChildren(svg);
  }

  // ---- Bar chart: single categorical axis, one sequential hue ----
  function renderBarChart(mount, tableWrap, opts) {
    const { items, formatValue, unit, caption } = opts;
    if (!items || !items.length) return emptyState(mount, 'No activity data yet for this period.');

    const height = 260;
    const padTop = 16, padBottom = 34, padLeft = 40, padRight = 10;
    const plotW = VB_W - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const maxVal = niceMax(Math.max(...items.map((d) => d.value)));
    const gap = 6;
    const slot = plotW / items.length;
    const barW = Math.max(4, Math.min(24, slot - gap));

    const svg = svgEl('svg', { viewBox: `0 0 ${VB_W} ${height}`, role: 'img', 'aria-label': caption });

    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = (maxVal / steps) * i;
      const y = padTop + plotH - (v / maxVal) * plotH;
      svg.appendChild(svgEl('line', { x1: padLeft, x2: VB_W - padRight, y1: y, y2: y, class: 'cx-grid' }));
      const label = svgEl('text', { x: padLeft - 8, y: y + 3, 'text-anchor': 'end', class: 'cx-axis-label' });
      label.textContent = Math.round(v);
      svg.appendChild(label);
    }

    const tip = ensureTooltip(mount.parentElement);
    const showEvery = items.length > 14 ? Math.ceil(items.length / 14) : 1;

    items.forEach((d, i) => {
      const x = padLeft + i * slot + (slot - barW) / 2;
      const h = maxVal > 0 ? (d.value / maxVal) * plotH : 0;
      const y = padTop + plotH - h;
      const path = svgEl('path', { d: roundedTopBarPath(x, y, barW, h, 4), class: 'cx-bar', tabindex: '0' });
      path.setAttribute('role', 'img');
      path.setAttribute('aria-label', `${d.label}: ${formatValue(d.value)} ${unit}`);

      const hit = svgEl('rect', {
        x: padLeft + i * slot, y: padTop, width: slot, height: plotH,
        fill: 'transparent',
      });

      const onEnter = () => {
        path.classList.add('is-active');
        const rect = mount.getBoundingClientRect();
        const scale = rect.width / VB_W;
        const px = (i * slot + slot / 2) * scale + padLeft * scale;
        const py = y * scale;
        showTooltip(tip, px, py, `<strong>${formatValue(d.value)} ${unit}</strong><br>${d.label}`);
      };
      const onLeave = () => { path.classList.remove('is-active'); hideTooltip(tip); };

      hit.addEventListener('pointerenter', onEnter);
      hit.addEventListener('pointermove', onEnter);
      hit.addEventListener('pointerleave', onLeave);
      path.addEventListener('focus', onEnter);
      path.addEventListener('blur', onLeave);

      svg.appendChild(path);
      svg.appendChild(hit);

      if (i % showEvery === 0 || i === items.length - 1) {
        const label = svgEl('text', { x: padLeft + i * slot + slot / 2, y: height - padBottom + 16, 'text-anchor': 'middle', class: 'cx-axis-label' });
        label.textContent = d.shortLabel ?? d.label;
        svg.appendChild(label);
      }
    });

    mount.replaceChildren(svg);

    buildTable(tableWrap, {
      caption,
      columns: ['Period', `Value (${unit})`],
      rows: items.map((d) => [d.label, formatValue(d.value)]),
    });
  }

  // ---- Line chart: trend over time, single series ----
  function renderLineChart(mount, tableWrap, opts) {
    const { items, formatValue, unit, caption, seriesClass, goal } = opts;
    if (!items || !items.length) return emptyState(mount, 'No activity data yet for this period.');

    const height = 260;
    const padTop = 20, padBottom = 34, padLeft = 44, padRight = 16;
    const plotW = VB_W - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const values = items.map((d) => d.value);
    const maxVal = niceMax(Math.max(...values, goal?.value ?? 0));
    const minVal = 0;

    const xFor = (i) => padLeft + (items.length === 1 ? plotW / 2 : (i / (items.length - 1)) * plotW);
    const yFor = (v) => padTop + plotH - ((v - minVal) / (maxVal - minVal || 1)) * plotH;

    const svg = svgEl('svg', { viewBox: `0 0 ${VB_W} ${height}`, role: 'img', 'aria-label': caption });

    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = (maxVal / steps) * i;
      const y = yFor(v);
      svg.appendChild(svgEl('line', { x1: padLeft, x2: VB_W - padRight, y1: y, y2: y, class: 'cx-grid' }));
      const label = svgEl('text', { x: padLeft - 8, y: y + 3, 'text-anchor': 'end', class: 'cx-axis-label' });
      label.textContent = Math.round(v * 10) / 10;
      svg.appendChild(label);
    }

    const points = items.map((d, i) => ({ x: xFor(i), y: yFor(d.value) }));

    if (goal) {
      const gy = yFor(goal.value);
      svg.appendChild(svgEl('line', { x1: padLeft, x2: VB_W - padRight, y1: gy, y2: gy, class: 'cx-goal-line' }));
      const gLabel = svgEl('text', { x: VB_W - padRight, y: gy - 6, 'text-anchor': 'end', class: 'cx-axis-label' });
      gLabel.textContent = goal.label;
      svg.appendChild(gLabel);
    }

    svg.appendChild(svgEl('path', { d: areaPath(points, padTop + plotH), class: `cx-area ${seriesClass.area}` }));
    svg.appendChild(svgEl('path', { d: linePath(points), class: `cx-line ${seriesClass.line}` }));

    const tip = ensureTooltip(mount.parentElement);
    const showEvery = items.length > 12 ? Math.ceil(items.length / 12) : 1;

    points.forEach((p, i) => {
      const dot = svgEl('circle', { cx: p.x, cy: p.y, r: 4, class: `cx-dot ${seriesClass.dot}`, tabindex: '0' });

      const hit = svgEl('circle', { cx: p.x, cy: p.y, r: 14, fill: 'transparent' });

      const onEnter = () => {
        const rect = mount.getBoundingClientRect();
        const scale = rect.width / VB_W;
        showTooltip(tip, p.x * scale, p.y * scale,
          `<strong>${formatValue(items[i].value)} ${unit}</strong><br>${items[i].label}`);
      };
      const onLeave = () => hideTooltip(tip);

      hit.addEventListener('pointerenter', onEnter);
      hit.addEventListener('pointermove', onEnter);
      hit.addEventListener('pointerleave', onLeave);
      dot.addEventListener('focus', onEnter);
      dot.addEventListener('blur', onLeave);

      svg.appendChild(dot);
      svg.appendChild(hit);

      if (i % showEvery === 0 || i === items.length - 1) {
        const label = svgEl('text', { x: p.x, y: height - padBottom + 16, 'text-anchor': 'middle', class: 'cx-axis-label' });
        label.textContent = items[i].shortLabel ?? items[i].label;
        svg.appendChild(label);
      }
    });

    mount.replaceChildren(svg);

    buildTable(tableWrap, {
      caption,
      columns: ['Period', `Value (${unit})`],
      rows: items.map((d) => [d.label, formatValue(d.value)]),
    });
  }

  return { renderBarChart, renderLineChart };
})();
