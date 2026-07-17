// Renders the Leaflet map of training routes decoded from Strava's summary_polyline.
const ChubbyMap = (() => {
  const LONDON_START = [51.4680, -0.0357]; // Blackheath — traditional London Marathon start

  function fmtKm(m) { return (m / 1000).toFixed(1); }
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function render(activities) {
    const el = document.getElementById('activityMap');
    if (!el || typeof L === 'undefined') return;

    const routed = activities.filter((a) => a.map && a.map.summary_polyline);

    const map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    const bounds = [];
    routed.forEach((a) => {
      const latlngs = decodePolyline(a.map.summary_polyline);
      if (!latlngs.length) return;
      const line = L.polyline(latlngs, {
        color: '#FC4C02',
        weight: 3,
        opacity: 0.75,
      }).addTo(map);

      line.on('mouseover', () => line.setStyle({ weight: 5, opacity: 1 }));
      line.on('mouseout', () => line.setStyle({ weight: 3, opacity: 0.75 }));

      const title = document.createElement('div');
      title.className = 'map-popup-title';
      title.textContent = a.name;
      const meta = document.createElement('div');
      meta.className = 'map-popup-meta';
      meta.textContent = `${fmtDate(a.start_date_local)} • ${fmtKm(a.distance)} km`;
      const popupBody = document.createElement('div');
      popupBody.appendChild(title);
      popupBody.appendChild(meta);
      line.bindPopup(popupBody);

      latlngs.forEach((ll) => bounds.push(ll));
    });

    // Mark the London Marathon 2027 start point as a fixed goal reference.
    const goalIcon = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#14151A;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    L.marker(LONDON_START, { icon: goalIcon })
      .addTo(map)
      .bindPopup('<div class="map-popup-title">London Marathon 2027</div><div class="map-popup-meta">Start line — Blackheath, 25 April 2027</div>');

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [30, 30] });
    } else {
      map.setView(LONDON_START, 10);
    }
  }

  return { render };
})();
