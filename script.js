/* ============================================
   River Coordinate Verifier — script.js
   Pure vanilla JS, no frameworks
   ============================================ */

(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────
  let map = null;               // Leaflet map instance
  let riverPolyline = null;     // Current L.Polyline on the map
  let startMarker = null;       // Marker at first coordinate
  let endMarker = null;         // Marker at last coordinate
  let pointNumberMarkers = [];  // Array of numbered circle markers
  let currentPaths = [];        // Raw [lat, lng] arrays from JSON
  let currentRiverData = null;  // Full parsed river object
  let leafletLatLngs = [];      // L.LatLng objects for the river

  // ─── DOM References ─────────────────────────────────────
  const urlInput        = document.getElementById('urlInput');
  const loadBtn         = document.getElementById('loadBtn');
  const clearBtn        = document.getElementById('clearBtn');
  const zoomBtn         = document.getElementById('zoomBtn');
  const statusBar       = document.getElementById('statusBar');
  const infoPanel       = document.getElementById('infoPanel');
  const infoName        = document.getElementById('infoName');
  const infoSlug        = document.getElementById('infoSlug');
  const infoPoints      = document.getElementById('infoPoints');
  const infoLength      = document.getElementById('infoLength');
  const infoBbox        = document.getElementById('infoBbox');
  const infoFetchTime   = document.getElementById('infoFetchTime');
  const infoRenderTime  = document.getElementById('infoRenderTime');
  const toggleMarkersCb = document.getElementById('toggleMarkers');
  const togglePointNums = document.getElementById('togglePointNumbers');
  const toggleDarkMode  = document.getElementById('toggleDarkMode');
  const copyStatsBtn    = document.getElementById('copyStatsBtn');
  const exportPngBtn    = document.getElementById('exportPngBtn');
  const coordInspector  = document.getElementById('coordInspector');
  const ciIndex         = document.getElementById('ciIndex');
  const ciLat           = document.getElementById('ciLat');
  const ciLng           = document.getElementById('ciLng');
  const hoverCoords     = document.getElementById('hoverCoords');
  const hoverLat        = document.getElementById('hoverLat');
  const hoverLng        = document.getElementById('hoverLng');
  const dropOverlay     = document.getElementById('dropOverlay');

  // ─── Constants ──────────────────────────────────────────
  const POINT_NUMBER_INTERVAL = 100; // Show a marker every N points
  const STORAGE_KEY = 'riverVerifier_lastUrl';

  // ═════════════════════════════════════════════════════════
  //  INITIALIZATION
  // ═════════════════════════════════════════════════════════

  /**
   * Initialize the application on DOM ready.
   */
  function init() {
    initMap();
    bindEvents();
    restoreDarkMode();
    restoreLastUrl();
    checkUrlParam();
  }

  /**
   * Create the Leaflet map centered on Bangladesh.
   */
  function initMap() {
    map = L.map('map', {
      center: [23.685, 90.3563],
      zoom: 7,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Hover coordinates
    map.on('mousemove', updateHoverCoords);
    map.on('mouseout', hideHoverCoords);
  }

  // ═════════════════════════════════════════════════════════
  //  EVENT BINDING
  // ═════════════════════════════════════════════════════════

  /**
   * Bind all DOM event listeners.
   */
  function bindEvents() {
    loadBtn.addEventListener('click', handleLoad);
    clearBtn.addEventListener('click', handleClear);
    zoomBtn.addEventListener('click', fitRiver);
    toggleMarkersCb.addEventListener('change', toggleMarkers);
    togglePointNums.addEventListener('change', togglePointNumbers);
    toggleDarkMode.addEventListener('change', toggleDarkModeHandler);
    copyStatsBtn.addEventListener('click', copyStats);
    exportPngBtn.addEventListener('click', exportPng);

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
   * Convert a GitHub blob URL to a raw.githubusercontent.com URL.
   * Also handles raw URLs and arbitrary JSON URLs directly.
   *
   * @param {string} url - The input URL.
   * @returns {{ rawUrl: string, isGithub: boolean }}
   * @throws {Error} If the URL is invalid.
   */
  function convertGithubUrl(url) {
    url = url.trim();

    // Already a raw URL — pass through
    if (url.startsWith('https://raw.githubusercontent.com/')) {
      return { rawUrl: url, isGithub: true };
    }

    // GitHub blob URL — convert
    const githubBlobRe = /^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+\/.+)$/i;
    const match = url.match(githubBlobRe);
    if (match) {
      const repo = match[1];    // e.g. "A-Sunny/nodi-kotha-data"
      const path = match[2];    // e.g. "main/api/rivers/0001_padma.json"
      const rawUrl = 'https://raw.githubusercontent.com/' + repo + '/' + path;
      return { rawUrl: rawUrl, isGithub: true };
    }

    // Fallback: treat as a direct URL to a JSON file
    try {
      new URL(url);
      if (url.toLowerCase().endsWith('.json') || url.includes('.json?')) {
        return { rawUrl: url, isGithub: false };
      }
    } catch (_) {
      // Not a valid URL at all
    }

    throw new Error('Invalid URL. Please paste a GitHub blob URL or a direct JSON URL.');
  }

  // ═════════════════════════════════════════════════════════
  //  DATA FETCHING
  // ═════════════════════════════════════════════════════════

  /**
   * Fetch JSON from the given URL.
   *
   * @param {string} rawUrl - The raw URL to fetch.
   * @returns {Promise<{ data: object, fetchTimeMs: number }>}
   */
  async function fetchRiver(rawUrl) {
    const t0 = performance.now();
    let response;

    try {
      response = await fetch(rawUrl);
    } catch (err) {
      throw new Error('Network error: ' + err.message);
    }

    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' ' + response.statusText);
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error('Failed to parse JSON response: ' + err.message);
    }

    const fetchTimeMs = Math.round(performance.now() - t0);
    return { data, fetchTimeMs };
  }

  // ═════════════════════════════════════════════════════════
  //  PARSING
  // ═════════════════════════════════════════════════════════

  /**
   * Parse and validate the river JSON object.
   *
   * @param {object} data - The raw JSON object.
   * @returns {{ name: string, slug: string, paths: number[][], latLngs: L.LatLng[] }}
   * @throws {Error} On validation failure.
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

    const paths = [];
    for (let i = 0; i < data.paths.length; i++) {
      const pt = data.paths[i];

      if (!Array.isArray(pt) || pt.length < 2) {
        throw new Error('Path point at index ' + i + ' is not a valid [lat, lng] array.');
      }

      const lat = Number(pt[0]);
      const lng = Number(pt[1]);

      if (!isFinite(lat) || !isFinite(lng)) {
        throw new Error('Invalid coordinate at path index ' + i + ': [' + pt[0] + ', ' + pt[1] + ']');
      }

      if (lat < -90 || lat > 90) {
        throw new Error('Latitude out of range at index ' + i + ': ' + lat);
      }

      if (lng < -180 || lng > 180) {
        throw new Error('Longitude out of range at index ' + i + ': ' + lng);
      }

      paths.push([lat, lng]);
    }

    // Build Leaflet LatLng array
    const latLngs = paths.map(function (p) {
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

  /**
   * Clear any previously drawn river layers from the map.
   */
  function clearRiver() {
    if (riverPolyline) {
      map.removeLayer(riverPolyline);
      riverPolyline = null;
    }
    if (startMarker) {
      map.removeLayer(startMarker);
      startMarker = null;
    }
    if (endMarker) {
      map.removeLayer(endMarker);
      endMarker = null;
    }
    clearPointNumberMarkers();

    currentPaths = [];
    currentRiverData = null;
    leafletLatLngs = [];

    infoPanel.classList.add('hidden');
    coordInspector.classList.add('hidden');
    zoomBtn.disabled = true;
  }

  /**
   * Remove all point-number circle markers.
   */
  function clearPointNumberMarkers() {
    pointNumberMarkers.forEach(function (m) { map.removeLayer(m); });
    pointNumberMarkers = [];
  }

  /**
   * Draw the parsed river data onto the map.
   *
   * @param {object} parsed - Output from parseRiver().
   * @returns {number} renderTimeMs
   */
  function drawRiver(parsed) {
    const t0 = performance.now();

    // Clear previous
    clearRiver();

    currentPaths = parsed.paths;
    currentRiverData = parsed;
    leafletLatLngs = parsed.latLngs;

    // Draw polyline
    riverPolyline = L.polyline(parsed.latLngs, {
      color: '#2563eb',
      weight: 3,
      opacity: 0.85,
      smoothFactor: 1,
    }).addTo(map);

    // Click handler for coordinate inspector
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

    const renderTimeMs = Math.round(performance.now() - t0);
    return renderTimeMs;
  }

  /**
   * Add start and end markers.
   */
  function addStartEndMarkers() {
    if (leafletLatLngs.length === 0) return;

    const startIcon = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;background:#16a34a;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const endIcon = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;background:#dc2626;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    startMarker = L.marker(leafletLatLngs[0], { icon: startIcon })
      .addTo(map)
      .bindPopup('River Start');

    endMarker = L.marker(leafletLatLngs[leafletLatLngs.length - 1], { icon: endIcon })
      .addTo(map)
      .bindPopup('River End');
  }

  /**
   * Add numbered circle markers at regular intervals.
   */
  function addPointNumberMarkers() {
    clearPointNumberMarkers();
    if (currentPaths.length === 0) return;

    for (let i = 0; i < currentPaths.length; i += POINT_NUMBER_INTERVAL) {
      const icon = L.divIcon({
        className: '',
        html: '<div class="point-number-marker">' + i + '</div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker(leafletLatLngs[i], { icon: icon }).addTo(map);
      marker.bindPopup('Point #' + i + '<br>Lat: ' + currentPaths[i][0] + '<br>Lng: ' + currentPaths[i][1]);
      pointNumberMarkers.push(marker);
    }

    // Also mark the last point if not already covered
    const lastIdx = currentPaths.length - 1;
    if (lastIdx > 0 && lastIdx % POINT_NUMBER_INTERVAL !== 0) {
      const icon = L.divIcon({
        className: '',
        html: '<div class="point-number-marker">' + lastIdx + '</div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker(leafletLatLngs[lastIdx], { icon: icon }).addTo(map);
      marker.bindPopup('Point #' + lastIdx + '<br>Lat: ' + currentPaths[lastIdx][0] + '<br>Lng: ' + currentPaths[lastIdx][1]);
      pointNumberMarkers.push(marker);
    }
  }

  // ═════════════════════════════════════════════════════════
  //  CALCULATIONS
  // ═════════════════════════════════════════════════════════

  /**
   * Calculate the total path length in kilometers using Leaflet's distance method.
   *
   * @param {L.LatLng[]} latLngs - Array of LatLng objects.
   * @returns {number} Distance in km.
   */
  function calculateLength(latLngs) {
    let total = 0;
    for (let i = 1; i < latLngs.length; i++) {
      total += latLngs[i - 1].distanceTo(latLngs[i]);
    }
    return total / 1000; // meters → km
  }

  /**
   * Get the bounding box as a string.
   *
   * @param {L.LatLng[]} latLngs
   * @returns {string}
   */
  function getBboxString(latLngs) {
    if (latLngs.length === 0) return '—';
    const bounds = L.latLngBounds(latLngs);
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return sw.lat.toFixed(4) + ', ' + sw.lng.toFixed(4) +
           ' → ' + ne.lat.toFixed(4) + ', ' + ne.lng.toFixed(4);
  }

  /**
   * Find the nearest point index on the river to a given LatLng.
   *
   * @param {L.LatLng} latlng
   * @returns {number} Index of the nearest point.
   */
  function findNearestPoint(latlng) {
    let minDist = Infinity;
    let minIdx = 0;

    for (let i = 0; i < leafletLatLngs.length; i++) {
      const d = latlng.distanceTo(leafletLatLngs[i]);
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

  /**
   * Show a status message.
   *
   * @param {string} message
   * @param {'info'|'success'|'error'} type
   */
  function showStatus(message, type) {
    statusBar.textContent = message;
    statusBar.className = 'status-bar status-' + (type || 'info');
  }

  /**
   * Clear the status bar.
   */
  function clearStatus() {
    statusBar.textContent = '';
    statusBar.className = 'status-bar';
  }

  /**
   * Update the river info panel.
   *
   * @param {object} parsed
   * @param {number} fetchTimeMs
   * @param {number} renderTimeMs
   */
  function updateInfoPanel(parsed, fetchTimeMs, renderTimeMs) {
    infoName.textContent = parsed.name;
    infoSlug.textContent = parsed.slug;
    infoPoints.textContent = parsed.paths.length.toLocaleString();
    infoLength.textContent = calculateLength(parsed.latLngs).toFixed(2) + ' km';
    infoBbox.textContent = getBboxString(parsed.latLngs);
    infoFetchTime.textContent = fetchTimeMs + ' ms';
    infoRenderTime.textContent = renderTimeMs + ' ms';
    infoPanel.classList.remove('hidden');
    zoomBtn.disabled = false;
  }

  /**
   * Fit the map to the current river bounds.
   */
  function fitRiver() {
    if (riverPolyline) {
      map.fitBounds(riverPolyline.getBounds(), { padding: [30, 30] });
    }
  }

  /**
   * Toggle start/end markers visibility.
   */
  function toggleMarkers() {
    if (toggleMarkersCb.checked) {
      // Add markers if river is loaded and they don't exist
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

  /**
   * Toggle numbered point markers visibility.
   */
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

  /**
   * Handle click on the polyline to show coordinate inspector.
   *
   * @param {L.LeafletMouseEvent} e
   */
  function handleCoordinateClick(e) {
    const idx = findNearestPoint(e.latlng);
    const pt = currentPaths[idx];

    ciIndex.textContent = idx;
    ciLat.textContent = pt[0];
    ciLng.textContent = pt[1];
    coordInspector.classList.remove('hidden');
  }

  /**
   * Update hover coordinate display.
   *
   * @param {L.LeafletMouseEvent} e
   */
  function updateHoverCoords(e) {
    hoverLat.textContent = e.latlng.lat.toFixed(5);
    hoverLng.textContent = e.latlng.lng.toFixed(5);
    hoverCoords.classList.remove('hidden');
  }

  /**
   * Hide hover coordinates.
   */
  function hideHoverCoords() {
    hoverCoords.classList.add('hidden');
  }

  // ═════════════════════════════════════════════════════════
  //  DARK MODE
  // ═════════════════════════════════════════════════════════

  /**
   * Handle dark mode toggle.
   */
  function toggleDarkModeHandler() {
    const isDark = toggleDarkMode.checked;
    document.body.classList.toggle('dark-mode', isDark);
    try {
      localStorage.setItem('riverVerifier_darkMode', isDark ? '1' : '0');
    } catch (_) { /* ignore */ }
  }

  /**
   * Restore dark mode preference from localStorage.
   */
  function restoreDarkMode() {
    try {
      const val = localStorage.getItem('riverVerifier_darkMode');
      if (val === '1') {
        toggleDarkMode.checked = true;
        document.body.classList.add('dark-mode');
      }
    } catch (_) { /* ignore */ }
  }

  // ═════════════════════════════════════════════════════════
  //  LOCALSTORAGE — Last URL
  // ═════════════════════════════════════════════════════════

  /**
   * Save the last loaded URL to localStorage.
   *
   * @param {string} url
   */
  function saveLastUrl(url) {
    try {
      localStorage.setItem(STORAGE_KEY, url);
    } catch (_) { /* ignore */ }
  }

  /**
   * Restore the last loaded URL from localStorage.
   */
  function restoreLastUrl() {
    try {
      const url = localStorage.getItem(STORAGE_KEY);
      if (url) {
        urlInput.value = url;
      }
    } catch (_) { /* ignore */ }
  }

  // ═════════════════════════════════════════════════════════
  //  URL QUERY PARAMETER
  // ═════════════════════════════════════════════════════════

  /**
   * Check if the page URL has a ?url= parameter and auto-load.
   */
  function checkUrlParam() {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');
    if (url) {
      urlInput.value = url;
      handleLoad();
    }
  }

  // ═════════════════════════════════════════════════════════
  //  COPY STATS
  // ═════════════════════════════════════════════════════════

  /**
   * Copy river statistics to clipboard.
   */
  function copyStats() {
    if (!currentRiverData) {
      showStatus('No river data to copy.', 'error');
      return;
    }

    const text = [
      'River Name: ' + currentRiverData.name,
      'Slug: ' + currentRiverData.slug,
      'Total Points: ' + currentPaths.length.toLocaleString(),
      'Path Length: ' + calculateLength(leafletLatLngs).toFixed(2) + ' km',
      'Bounding Box: ' + getBboxString(leafletLatLngs),
    ].join('\n');

    navigator.clipboard.writeText(text).then(function () {
      showStatus('Statistics copied to clipboard.', 'success');
    }).catch(function () {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showStatus('Statistics copied to clipboard.', 'success');
      } catch (_) {
        showStatus('Failed to copy to clipboard.', 'error');
      }
      document.body.removeChild(ta);
    });
  }

  // ═════════════════════════════════════════════════════════
  //  EXPORT PNG
  // ═════════════════════════════════════════════════════════

  /**
   * Export the current map view as a PNG image.
   */
  function exportPng() {
    if (typeof html2canvas === 'undefined') {
      showStatus('html2canvas library not loaded. Cannot export PNG.', 'error');
      return;
    }

    showStatus('Exporting map as PNG...', 'info');

    const mapEl = document.getElementById('map');
    html2canvas(mapEl, {
      useCORS: true,
      allowTaint: true,
      scale: 2,
    }).then(function (canvas) {
      const link = document.createElement('a');
      const slug = currentRiverData ? currentRiverData.slug : 'map';
      link.download = slug + '_map.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      showStatus('Map exported as PNG.', 'success');
    }).catch(function (err) {
      showStatus('PNG export failed: ' + err.message, 'error');
    });
  }

  // ═════════════════════════════════════════════════════════
  //  DRAG & DROP
  // ═════════════════════════════════════════════════════════

  let dragCounter = 0;

  /**
   * Show the drag & drop overlay.
   */
  function showDropOverlay(e) {
    e.preventDefault();
    dragCounter++;
    dropOverlay.classList.remove('hidden');
  }

  /**
   * Hide the drag & drop overlay.
   */
  function hideDropOverlay(e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropOverlay.classList.add('hidden');
    }
  }

  /**
   * Handle file drop.
   *
   * @param {DragEvent} e
   */
  function handleDrop(e) {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.add('hidden');

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.json')) {
      showStatus('Please drop a .json file.', 'error');
      return;
    }

    loadFromFile(file);
  }

  /**
   * Load river data from a dropped/selected File object.
   *
   * @param {File} file
   */
  function loadFromFile(file) {
    showStatus('Reading file...', 'info');

    const t0 = performance.now();
    const reader = new FileReader();

    reader.onload = function (e) {
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch (err) {
        showStatus('Failed to parse JSON file: ' + err.message, 'error');
        return;
      }

      const fetchTimeMs = Math.round(performance.now() - t0);

      try {
        const parsed = parseRiver(data);
        const renderTimeMs = drawRiver(parsed);
        updateInfoPanel(parsed, fetchTimeMs, renderTimeMs);
        showStatus(
          'River "' + parsed.name + '" loaded successfully — ' +
          parsed.paths.length.toLocaleString() + ' points.',
          'success'
        );
        urlInput.value = '(loaded from file: ' + file.name + ')';
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

  /**
   * Handle the "Load River" button click.
   */
  async function handleLoad() {
    const url = urlInput.value.trim();

    if (!url) {
      showStatus('Please enter a URL.', 'error');
      return;
    }

    // Step 1: Convert URL
    let rawUrl;
    try {
      const result = convertGithubUrl(url);
      rawUrl = result.rawUrl;
    } catch (err) {
      showStatus(err.message, 'error');
      return;
    }

    // Step 2: Fetch
    showStatus('Fetching ' + rawUrl + ' ...', 'info');

    let fetchResult;
    try {
      fetchResult = await fetchRiver(rawUrl);
    } catch (err) {
      showStatus('JSON fetch failed: ' + err.message, 'error');
      return;
    }

    // Step 3: Parse
    let parsed;
    try {
      parsed = parseRiver(fetchResult.data);
    } catch (err) {
      showStatus(err.message, 'error');
      return;
    }

    // Step 4: Draw
    try {
      const renderTimeMs = drawRiver(parsed);
      updateInfoPanel(parsed, fetchResult.fetchTimeMs, renderTimeMs);
      showStatus(
        'River "' + parsed.name + '" loaded successfully — ' +
        parsed.paths.length.toLocaleString() + ' points.',
        'success'
      );
      saveLastUrl(url);
    } catch (err) {
      showStatus('Render error: ' + err.message, 'error');
    }
  }

  /**
   * Handle the "Clear" button click.
   */
  function handleClear() {
    clearRiver();
    clearStatus();
    urlInput.value = '';
    saveLastUrl('');
  }

  // ═════════════════════════════════════════════════════════
  //  BOOT
  // ═════════════════════════════════════════════════════════

  // Initialize when the DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
