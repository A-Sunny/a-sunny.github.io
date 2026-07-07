/* ============================================
   River Coordinate Verifier — script.js
   Pure vanilla JS, no frameworks
   ============================================ */

(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────
  let map = null;
  let riverPolyline = null;
  let startMarker = null;
  let endMarker = null;
  let pointNumberMarkers = [];
  let currentPaths = [];       // Stored as [lat, lng] after swap
  let currentRiverData = null;
  let leafletLatLngs = [];

  // ─── DOM References ─────────────────────────────────────
  const urlInput         = document.getElementById('urlInput');
  const loadBtn          = document.getElementById('loadBtn');
  const clearBtn         = document.getElementById('clearBtn');
  const zoomBtn          = document.getElementById('zoomBtn');
  const statusBar        = document.getElementById('statusBar');
  const infoPanel        = document.getElementById('infoPanel');
  const infoPoints       = document.getElementById('infoPoints');
  const infoLength       = document.getElementById('infoLength');
  const infoBbox         = document.getElementById('infoBbox');
  const infoFetchTime    = document.getElementById('infoFetchTime');
  const infoRenderTime   = document.getElementById('infoRenderTime');
  const toggleMarkersCb  = document.getElementById('toggleMarkers');
  const togglePointNums  = document.getElementById('togglePointNumbers');
  const toggleDarkMode   = document.getElementById('toggleDarkMode');
  const copyStatsBtn     = document.getElementById('copyStatsBtn');
  const exportPngBtn     = document.getElementById('exportPngBtn');
  const coordInspector   = document.getElementById('coordInspector');
  const ciIndex          = document.getElementById('ciIndex');
  const ciLat            = document.getElementById('ciLat');
  const ciLng            = document.getElementById('ciLng');
  const hoverCoords      = document.getElementById('hoverCoords');
  const hoverLat         = document.getElementById('hoverLat');
  const hoverLng         = document.getElementById('hoverLng');
  const dropOverlay      = document.getElementById('dropOverlay');
  const sidebar          = document.getElementById('sidebar');
  const closeSidebarBtn  = document.getElementById('closeSidebarBtn');
  const openSidebarBtn   = document.getElementById('openSidebarBtn');

  // ─── Constants ──────────────────────────────────────────
  const POINT_NUMBER_INTERVAL = 100;
  const STORAGE_KEY = 'riverVerifier_lastUrl';

  // ═════════════════════════════════════════════════════════
  //  INITIALIZATION
  // ═════════════════════════════════════════════════════════

  function init() {
    initMap();
    bindEvents();
    restoreDarkMode();
    restoreLastUrl();
    restoreSidebar();
    checkUrlParam();
  }

  function initMap() {
    map = L.map('map', {
      center: [23.685, 90.3563],
      zoom: 7,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on('mousemove', updateHoverCoords);
    map.on('mouseout', hideHoverCoords);
  }

  // ═════════════════════════════════════════════════════════
  //  SIDEBAR TOGGLE
  // ═════════════════════════════════════════════════════════

  function collapseSidebar() {
    sidebar.classList.add('collapsed');
    openSidebarBtn.classList.remove('hidden');
    // Let Leaflet know the container size changed
    setTimeout(function () { map.invalidateSize(); }, 350);
    try { localStorage.setItem('riverVerifier_sidebar', 'closed'); } catch (_) {}
  }

  function expandSidebar() {
    sidebar.classList.remove('collapsed');
    openSidebarBtn.classList.add('hidden');
    setTimeout(function () { map.invalidateSize(); }, 350);
    try { localStorage.setItem('riverVerifier_sidebar', 'open'); } catch (_) {}
  }

  function restoreSidebar() {
    try {
      if (localStorage.getItem('riverVerifier_sidebar') === 'closed') {
        sidebar.classList.add('collapsed');
        openSidebarBtn.classList.remove('hidden');
        // Delay map size fix until after first render
        setTimeout(function () { map.invalidateSize(); }, 400);
      }
    } catch (_) {}
  }

  // ═════════════════════════════════════════════════════════
  //  EVENT BINDING
  // ═════════════════════════════════════════════════════════

  function bindEvents() {
    loadBtn.addEventListener('click', handleLoad);
    clearBtn.addEventListener('click', handleClear);
    zoomBtn.addEventListener('click', fitRiver);
    toggleMarkersCb.addEventListener('change', toggleMarkers);
    togglePointNums.addEventListener('change', togglePointNumbers);
    toggleDarkMode.addEventListener('change', toggleDarkModeHandler);
    copyStatsBtn.addEventListener('click', copyStats);
    exportPngBtn.addEventListener('click', exportPng);
    closeSidebarBtn.addEventListener('click', collapseSidebar);
    openSidebarBtn.addEventListener('click', expandSidebar);

    // Keyboard shortcut: Ctrl+Enter to load
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleLoad();
      }
    });

    // Drag & drop
    document.addEventListener('dragenter', showDropOverlay);
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('dragleave', hideDropOverlay);
    document.addEventListener('drop', handleDrop);
  }

  // ═════════════════════════════════════════════════════════
  //  URL CONVERSION
  // ═════════════════════════════════════════════════════════

  /**
   * Convert a GitHub blob URL to raw.githubusercontent.com.
   * Also handles raw URLs and arbitrary JSON URLs directly.
   *
   * @param {string} url
   * @returns {{ rawUrl: string }}
   * @throws {Error}
   */
  function convertGithubUrl(url) {
    url = url.trim();

    if (url.startsWith('https://raw.githubusercontent.com/')) {
      return { rawUrl: url };
    }

    var githubBlobRe = /^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+\/.+)$/i;
    var match = url.match(githubBlobRe);
    if (match) {
      var rawUrl = 'https://raw.githubusercontent.com/' + match[1] + '/' + match[2];
      return { rawUrl: rawUrl };
    }

    try {
      new URL(url);
      if (url.toLowerCase().endsWith('.json') || url.includes('.json?')) {
        return { rawUrl: url };
      }
    } catch (_) {}

    throw new Error('Invalid URL. Paste a GitHub blob URL or direct JSON URL.');
  }

  // ═════════════════════════════════════════════════════════
  //  DATA FETCHING
  // ═════════════════════════════════════════════════════════

  /**
   * Fetch JSON from the given URL.
   * @param {string} rawUrl
   * @returns {Promise<{ data: object, fetchTimeMs: number }>}
   */
  async function fetchRiver(rawUrl) {
    var t0 = performance.now();
    var response;

    try {
      response = await fetch(rawUrl);
    } catch (err) {
      throw new Error('Network error: ' + err.message);
    }

    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' ' + response.statusText);
    }

    var data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error('Failed to parse JSON: ' + err.message);
    }

    return { data: data, fetchTimeMs: Math.round(performance.now() - t0) };
  }

  // ═════════════════════════════════════════════════════════
  //  PARSING
  // ═════════════════════════════════════════════════════════

  /**
   * Parse and validate the river JSON.
   * QGIS exports coordinates as [longitude, latitude].
   * We swap them to [latitude, longitude] for Leaflet.
   *
   * @param {object} data
   * @returns {{ paths: number[][], latLngs: L.LatLng[] }}
   * @throws {Error}
   */
  function parseRiver(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('JSON is not a valid object.');
    }

    if (!Array.isArray(data.paths)) {
      throw new Error('The JSON does not contain a "paths" array.');
    }

    if (data.paths.length === 0) {
      throw new Error('The "paths" array is empty.');
    }

    var paths = [];
    for (var i = 0; i < data.paths.length; i++) {
      var pt = data.paths[i];

      if (!Array.isArray(pt) || pt.length < 2) {
        throw new Error('Point at index ' + i + ' is not a valid [lng, lat] array.');
      }

      // QGIS format: [longitude, latitude]
      var lng = Number(pt[0]);
      var lat = Number(pt[1]);

      if (!isFinite(lat) || !isFinite(lng)) {
        throw new Error('Invalid coordinate at index ' + i + ': [' + pt[0] + ', ' + pt[1] + ']');
      }
      if (lat < -90 || lat > 90) {
        throw new Error('Latitude out of range at index ' + i + ': ' + lat);
      }
      if (lng < -180 || lng > 180) {
        throw new Error('Longitude out of range at index ' + i + ': ' + lng);
      }

      // Store as [lat, lng] internally
      paths.push([lat, lng]);
    }

    var latLngs = paths.map(function (p) {
      return L.latLng(p[0], p[1]);
    });

    return {
      name: data.name || '(unnamed)',
      slug: data.slug || '(no slug)',
      paths: paths,
      latLngs: latLngs,
    };
  }

  // ═════════════════════════════════════════════════════════
  //  DRAWING
  // ═════════════════════════════════════════════════════════

  function clearRiver() {
    if (riverPolyline) { map.removeLayer(riverPolyline); riverPolyline = null; }
    if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
    if (endMarker) { map.removeLayer(endMarker); endMarker = null; }
    clearPointNumberMarkers();

    currentPaths = [];
    currentRiverData = null;
    leafletLatLngs = [];

    infoPanel.classList.add('hidden');
    coordInspector.classList.add('hidden');
    zoomBtn.disabled = true;
  }

  function clearPointNumberMarkers() {
    pointNumberMarkers.forEach(function (m) { map.removeLayer(m); });
    pointNumberMarkers = [];
  }

  /**
   * Draw the parsed river on the map.
   * @param {object} parsed
   * @returns {number} renderTimeMs
   */
  function drawRiver(parsed) {
    var t0 = performance.now();

    clearRiver();

    currentPaths = parsed.paths;
    currentRiverData = parsed;
    leafletLatLngs = parsed.latLngs;

    // Polyline
    riverPolyline = L.polyline(parsed.latLngs, {
      color: '#2563eb',
      weight: 3,
      opacity: 0.85,
      smoothFactor: 1,
    }).addTo(map);

    riverPolyline.on('click', handleCoordinateClick);

    // Start & end markers
    if (toggleMarkersCb.checked) {
      addStartEndMarkers();
    }

    // Point numbers
    if (togglePointNums.checked) {
      addPointNumberMarkers();
    }

    // Fit bounds
    map.fitBounds(riverPolyline.getBounds(), { padding: [30, 30] });

    return Math.round(performance.now() - t0);
  }

  function addStartEndMarkers() {
    if (leafletLatLngs.length === 0) return;

    var startIcon = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;background:#16a34a;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    var endIcon = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;background:#dc2626;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    startMarker = L.marker(leafletLatLngs[0], { icon: startIcon })
      .addTo(map).bindPopup('River Start');

    endMarker = L.marker(leafletLatLngs[leafletLatLngs.length - 1], { icon: endIcon })
      .addTo(map).bindPopup('River End');
  }

  function addPointNumberMarkers() {
    clearPointNumberMarkers();
    if (currentPaths.length === 0) return;

    for (var i = 0; i < currentPaths.length; i += POINT_NUMBER_INTERVAL) {
      var icon = L.divIcon({
        className: '',
        html: '<div class="point-number-marker">' + i + '</div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      var marker = L.marker(leafletLatLngs[i], { icon: icon }).addTo(map);
      marker.bindPopup('#' + i + '<br>Lat: ' + currentPaths[i][0] + '<br>Lng: ' + currentPaths[i][1]);
      pointNumberMarkers.push(marker);
    }

    // Always mark the last point if not already covered
    var lastIdx = currentPaths.length - 1;
    if (lastIdx > 0 && lastIdx % POINT_NUMBER_INTERVAL !== 0) {
      var icon = L.divIcon({
        className: '',
        html: '<div class="point-number-marker">' + lastIdx + '</div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      var marker = L.marker(leafletLatLngs[lastIdx], { icon: icon }).addTo(map);
      marker.bindPopup('#' + lastIdx + '<br>Lat: ' + currentPaths[lastIdx][0] + '<br>Lng: ' + currentPaths[lastIdx][1]);
      pointNumberMarkers.push(marker);
    }
  }

  // ═════════════════════════════════════════════════════════
  //  CALCULATIONS
  // ═════════════════════════════════════════════════════════

  function calculateLength(latLngs) {
    var total = 0;
    for (var i = 1; i < latLngs.length; i++) {
      total += latLngs[i - 1].distanceTo(latLngs[i]);
    }
    return total / 1000;
  }

  function getBboxString(latLngs) {
    if (latLngs.length === 0) return '\u2014';
    var bounds = L.latLngBounds(latLngs);
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();
    return sw.lat.toFixed(4) + ', ' + sw.lng.toFixed(4) +
           ' \u2192 ' + ne.lat.toFixed(4) + ', ' + ne.lng.toFixed(4);
  }

  function findNearestPoint(latlng) {
    var minDist = Infinity;
    var minIdx = 0;
    for (var i = 0; i < leafletLatLngs.length; i++) {
      var d = latlng.distanceTo(leafletLatLngs[i]);
      if (d < minDist) {
        minDist = d;
        minIdx = i;
      }
    }
    return minIdx;
  }

  // ═════════════════════════════════════════════════════════
  //  UI HELPERS
  // ═════════════════════════════════════════════════════════

  function showStatus(message, type) {
    statusBar.textContent = message;
    statusBar.className = 'status-bar status-' + (type || 'info');
  }

  function clearStatus() {
    statusBar.textContent = '';
    statusBar.className = 'status-bar';
  }

  function updateInfoPanel(parsed, fetchTimeMs, renderTimeMs) {
    infoPoints.textContent = parsed.paths.length.toLocaleString();
    infoLength.textContent = calculateLength(parsed.latLngs).toFixed(2) + ' km';
    infoBbox.textContent = getBboxString(parsed.latLngs);
    infoFetchTime.textContent = fetchTimeMs + ' ms';
    infoRenderTime.textContent = renderTimeMs + ' ms';
    infoPanel.classList.remove('hidden');
    zoomBtn.disabled = false;
  }

  function fitRiver() {
    if (riverPolyline) {
      map.fitBounds(riverPolyline.getBounds(), { padding: [30, 30] });
    }
  }

  function toggleMarkers() {
    if (toggleMarkersCb.checked) {
      if (leafletLatLngs.length > 0 && !startMarker) {
        addStartEndMarkers();
      } else if (startMarker) {
        startMarker.addTo(map);
        endMarker.addTo(map);
      }
    } else {
      if (startMarker) {
        map.removeLayer(startMarker);
        map.removeLayer(endMarker);
      }
    }
  }

  function togglePointNumbers() {
    if (togglePointNums.checked) {
      if (currentPaths.length > 0 && pointNumberMarkers.length === 0) {
        addPointNumberMarkers();
      } else {
        pointNumberMarkers.forEach(function (m) { m.addTo(map); });
      }
    } else {
      clearPointNumberMarkers();
    }
  }

  function handleCoordinateClick(e) {
    var idx = findNearestPoint(e.latlng);
    var pt = currentPaths[idx];
    ciIndex.textContent = idx;
    ciLat.textContent = pt[0];
    ciLng.textContent = pt[1];
    coordInspector.classList.remove('hidden');
  }

  function updateHoverCoords(e) {
    hoverLat.textContent = e.latlng.lat.toFixed(5);
    hoverLng.textContent = e.latlng.lng.toFixed(5);
    hoverCoords.classList.remove('hidden');
  }

  function hideHoverCoords() {
    hoverCoords.classList.add('hidden');
  }

  // ═════════════════════════════════════════════════════════
  //  DARK MODE
  // ═════════════════════════════════════════════════════════

  function toggleDarkModeHandler() {
    var isDark = toggleDarkMode.checked;
    document.body.classList.toggle('dark-mode', isDark);
    try { localStorage.setItem('riverVerifier_darkMode', isDark ? '1' : '0'); } catch (_) {}
  }

  function restoreDarkMode() {
    try {
      if (localStorage.getItem('riverVerifier_darkMode') === '1') {
        toggleDarkMode.checked = true;
        document.body.classList.add('dark-mode');
      }
    } catch (_) {}
  }

  // ═════════════════════════════════════════════════════════
  //  LOCALSTORAGE
  // ═════════════════════════════════════════════════════════

  function saveLastUrl(url) {
    try { localStorage.setItem(STORAGE_KEY, url); } catch (_) {}
  }

  function restoreLastUrl() {
    try {
      var url = localStorage.getItem(STORAGE_KEY);
      if (url) urlInput.value = url;
    } catch (_) {}
  }

  // ═════════════════════════════════════════════════════════
  //  URL QUERY PARAMETER
  // ═════════════════════════════════════════════════════════

  function checkUrlParam() {
    var params = new URLSearchParams(window.location.search);
    var url = params.get('url');
    if (url) {
      urlInput.value = url;
      handleLoad();
    }
  }

  // ═════════════════════════════════════════════════════════
  //  COPY STATS
  // ═════════════════════════════════════════════════════════

  function copyStats() {
    if (!currentRiverData) {
      showStatus('No data to copy.', 'error');
      return;
    }

    var text = [
      'Total Points: ' + currentPaths.length.toLocaleString(),
      'Path Length: ' + calculateLength(leafletLatLngs).toFixed(2) + ' km',
      'Bounding Box: ' + getBboxString(leafletLatLngs),
    ].join('\n');

    navigator.clipboard.writeText(text).then(function () {
      showStatus('Copied.', 'success');
    }).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showStatus('Copied.', 'success');
      } catch (_) {
        showStatus('Copy failed.', 'error');
      }
      document.body.removeChild(ta);
    });
  }

  // ═════════════════════════════════════════════════════════
  //  EXPORT PNG
  // ═════════════════════════════════════════════════════════

  function exportPng() {
    if (typeof html2canvas === 'undefined') {
      showStatus('html2canvas not loaded.', 'error');
      return;
    }

    showStatus('Exporting PNG...', 'info');

    var mapEl = document.getElementById('map');
    html2canvas(mapEl, {
      useCORS: true,
      allowTaint: true,
      scale: 2,
    }).then(function (canvas) {
      var link = document.createElement('a');
      var slug = currentRiverData ? currentRiverData.slug : 'map';
      link.download = slug + '_map.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      showStatus('Exported.', 'success');
    }).catch(function (err) {
      showStatus('Export failed: ' + err.message, 'error');
    });
  }

  // ═════════════════════════════════════════════════════════
  //  DRAG & DROP
  // ═════════════════════════════════════════════════════════

  var dragCounter = 0;

  function showDropOverlay(e) {
    e.preventDefault();
    dragCounter++;
    dropOverlay.classList.remove('hidden');
  }

  function hideDropOverlay(e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropOverlay.classList.add('hidden');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.add('hidden');

    var files = e.dataTransfer.files;
    if (files.length === 0) return;

    var file = files[0];
    if (!file.name.toLowerCase().endsWith('.json')) {
      showStatus('Please drop a .json file.', 'error');
      return;
    }

    loadFromFile(file);
  }

  function loadFromFile(file) {
    showStatus('Reading file...', 'info');

    var t0 = performance.now();
    var reader = new FileReader();

    reader.onload = function (e) {
      var data;
      try {
        data = JSON.parse(e.target.result);
      } catch (err) {
        showStatus('Bad JSON: ' + err.message, 'error');
        return;
      }

      var fetchTimeMs = Math.round(performance.now() - t0);

      try {
        var parsed = parseRiver(data);
        var renderTimeMs = drawRiver(parsed);
        updateInfoPanel(parsed, fetchTimeMs, renderTimeMs);
        showStatus('Loaded ' + parsed.paths.length.toLocaleString() + ' points.', 'success');
        urlInput.value = '(file: ' + file.name + ')';
        saveLastUrl('');
      } catch (err) {
        showStatus(err.message, 'error');
      }
    };

    reader.onerror = function () {
      showStatus('Failed to read file.', 'error');
    };

    reader.readAsText(file);
  }

  // ═════════════════════════════════════════════════════════
  //  MAIN HANDLERS
  // ═════════════════════════════════════════════════════════

  async function handleLoad() {
    var url = urlInput.value.trim();

    if (!url) {
      showStatus('Enter a URL.', 'error');
      return;
    }

    // Step 1: Convert URL
    var rawUrl;
    try {
      var result = convertGithubUrl(url);
      rawUrl = result.rawUrl;
    } catch (err) {
      showStatus(err.message, 'error');
      return;
    }

    // Step 2: Fetch
    showStatus('Fetching...', 'info');

    var fetchResult;
    try {
      fetchResult = await fetchRiver(rawUrl);
    } catch (err) {
      showStatus('Fetch failed: ' + err.message, 'error');
      return;
    }

    // Step 3: Parse
    var parsed;
    try {
      parsed = parseRiver(fetchResult.data);
    } catch (err) {
      showStatus(err.message, 'error');
      return;
    }

    // Step 4: Draw
    try {
      var renderTimeMs = drawRiver(parsed);
      updateInfoPanel(parsed, fetchResult.fetchTimeMs, renderTimeMs);
      showStatus('Loaded ' + parsed.paths.length.toLocaleString() + ' points.', 'success');
      saveLastUrl(url);
    } catch (err) {
      showStatus('Render error: ' + err.message, 'error');
    }
  }

  function handleClear() {
    clearRiver();
    clearStatus();
    urlInput.value = '';
    saveLastUrl('');
  }

  // ═════════════════════════════════════════════════════════
  //  BOOT
  // ═════════════════════════════════════════════════════════

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();