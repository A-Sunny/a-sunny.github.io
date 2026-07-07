/* ============================================
   River Coordinate Verifier — script.js
   Pure vanilla JS, no frameworks

   Coordinate format: QGIS exports [longitude, latitude].
   Paths format: array of segments, each segment is an
   array of [lng, lat] coordinate pairs.
   ============================================ */

(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────
  var map = null;
  var riverPolylines = [];     // One L.Polyline per segment
  var startMarker = null;
  var endMarker = null;
  var pointNumberMarkers = [];
  var allPaths = [];           // Flat array of [lat, lng] across all segments
  var segmentCount = 0;
  var currentRiverData = null;

  // ─── DOM References ─────────────────────────────────────
  var urlInput         = document.getElementById('urlInput');
  var loadBtn          = document.getElementById('loadBtn');
  var clearBtn         = document.getElementById('clearBtn');
  var zoomBtn          = document.getElementById('zoomBtn');
  var statusBar        = document.getElementById('statusBar');
  var infoPanel        = document.getElementById('infoPanel');
  var infoPoints       = document.getElementById('infoPoints');
  var infoSegments     = document.getElementById('infoSegments');
  var infoLength       = document.getElementById('infoLength');
  var infoBbox         = document.getElementById('infoBbox');
  var infoFetchTime    = document.getElementById('infoFetchTime');
  var infoRenderTime   = document.getElementById('infoRenderTime');
  var toggleMarkersCb  = document.getElementById('toggleMarkers');
  var togglePointNums  = document.getElementById('togglePointNumbers');
  var toggleDarkMode   = document.getElementById('toggleDarkMode');
  var copyStatsBtn     = document.getElementById('copyStatsBtn');
  var exportPngBtn     = document.getElementById('exportPngBtn');
  var coordInspector   = document.getElementById('coordInspector');
  var ciIndex          = document.getElementById('ciIndex');
  var ciLat            = document.getElementById('ciLat');
  var ciLng            = document.getElementById('ciLng');
  var hoverCoords      = document.getElementById('hoverCoords');
  var hoverLat         = document.getElementById('hoverLat');
  var hoverLng         = document.getElementById('hoverLng');
  var dropOverlay      = document.getElementById('dropOverlay');
  var sidebar          = document.getElementById('sidebar');
  var closeSidebarBtn  = document.getElementById('closeSidebarBtn');
  var openSidebarBtn   = document.getElementById('openSidebarBtn');

  // ─── Constants ──────────────────────────────────────────
  var POINT_NUMBER_INTERVAL = 100;
  var STORAGE_KEY = 'riverVerifier_lastUrl';

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
    openSidebarBtn.classList.add('visible');
    setTimeout(function () { map.invalidateSize(); }, 350);
    try { localStorage.setItem('riverVerifier_sidebar', 'closed'); } catch (_) {}
  }

  function expandSidebar() {
    sidebar.classList.remove('collapsed');
    openSidebarBtn.classList.remove('visible');
    setTimeout(function () { map.invalidateSize(); }, 350);
    try { localStorage.setItem('riverVerifier_sidebar', 'open'); } catch (_) {}
  }

  function restoreSidebar() {
    try {
      if (localStorage.getItem('riverVerifier_sidebar') === 'closed') {
        sidebar.classList.add('collapsed');
        openSidebarBtn.classList.add('visible');
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

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleLoad();
      }
    });

    document.addEventListener('dragenter', showDropOverlay);
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('dragleave', hideDropOverlay);
    document.addEventListener('drop', handleDrop);
  }

  // ═════════════════════════════════════════════════════════
  //  URL CONVERSION
  // ═════════════════════════════════════════════════════════

  function convertGithubUrl(url) {
    url = url.trim();

    if (url.startsWith('https://raw.githubusercontent.com/')) {
      return { rawUrl: url };
    }

    var re = /^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+\/.+)$/i;
    var m = url.match(re);
    if (m) {
      return { rawUrl: 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] };
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
   * Detect whether paths is a flat array of points or an array of segments.
   * Each point from QGIS is [longitude, latitude].
   *
   * Returns:
   *   segments: [ [ [lat,lng], [lat,lng], ... ], ... ]
   *   allPoints: flat [ [lat,lng], ... ] across all segments
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

    var first = data.paths[0];

    // Detect format:
    //   Flat:   paths = [ [lng, lat], [lng, lat], ... ]
    //   Nested: paths = [ [ [lng,lat], [lng,lat], ... ], [ ... ], ... ]
    var isNested = Array.isArray(first) && first.length > 0 && Array.isArray(first[0]);

    var segments = []; // each element: array of [lat, lng]
    var allPoints = [];

    if (isNested) {
      // Array of segments
      for (var s = 0; s < data.paths.length; s++) {
        var seg = data.paths[s];
        if (!Array.isArray(seg) || seg.length === 0) continue;
        var parsed = parseSegment(seg, s);
        segments.push(parsed);
        allPoints = allPoints.concat(parsed);
      }
    } else {
      // Single flat array of [lng, lat] pairs
      var parsed = parseSegment(data.paths, 0);
      segments.push(parsed);
      allPoints = parsed;
    }

    if (allPoints.length === 0) {
      throw new Error('No valid coordinates found.');
    }

    return {
      name: data.name || data.name_en || '(unnamed)',
      slug: data.slug || '(no slug)',
      segments: segments,
      allPoints: allPoints,
      segmentCount: segments.length,
    };
  }

  /**
   * Parse one segment (array of [lng, lat] from QGIS) into array of [lat, lng].
   * Throws descriptive errors on bad data.
   */
  function parseSegment(seg, segIndex) {
    var result = [];
    for (var i = 0; i < seg.length; i++) {
      var pt = seg[i];

      if (!Array.isArray(pt) || pt.length < 2) {
        throw new Error(
          'Segment ' + segIndex + ', point ' + i +
          ': expected [lng, lat] array, got ' + JSON.stringify(pt)
        );
      }

      // QGIS format: [longitude, latitude]
      var lng = Number(pt[0]);
      var lat = Number(pt[1]);

      if (!isFinite(lat) || !isFinite(lng)) {
        throw new Error(
          'Segment ' + segIndex + ', point ' + i +
          ': non-numeric coordinate [' + pt[0] + ', ' + pt[1] + ']'
        );
      }
      if (lat < -90 || lat > 90) {
        throw new Error(
          'Segment ' + segIndex + ', point ' + i +
          ': latitude out of range (' + lat + ')'
        );
      }
      if (lng < -180 || lng > 180) {
        throw new Error(
          'Segment ' + segIndex + ', point ' + i +
          ': longitude out of range (' + lng + ')'
        );
      }

      result.push([lat, lng]); // Store as [lat, lng]
    }
    return result;
  }

  // ═════════════════════════════════════════════════════════
  //  DRAWING
  // ═════════════════════════════════════════════════════════

  function clearRiver() {
    riverPolylines.forEach(function (pl) { map.removeLayer(pl); });
    riverPolylines = [];

    if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
    if (endMarker) { map.removeLayer(endMarker); endMarker = null; }
    clearPointNumberMarkers();

    allPaths = [];
    segmentCount = 0;
    currentRiverData = null;

    infoPanel.classList.add('hidden');
    coordInspector.classList.add('hidden');
    zoomBtn.disabled = true;
  }

  function clearPointNumberMarkers() {
    pointNumberMarkers.forEach(function (m) { map.removeLayer(m); });
    pointNumberMarkers = [];
  }

  function drawRiver(parsed) {
    var t0 = performance.now();
    clearRiver();

    allPaths = parsed.allPoints;
    segmentCount = parsed.segmentCount;
    currentRiverData = parsed;

    // Draw each segment as its own polyline
    parsed.segments.forEach(function (seg) {
      var latLngs = seg.map(function (p) { return L.latLng(p[0], p[1]); });
      var pl = L.polyline(latLngs, {
        color: '#2563eb',
        weight: 3,
        opacity: 0.85,
        smoothFactor: 1,
      }).addTo(map);
      pl.on('click', handleCoordinateClick);
      riverPolylines.push(pl);
    });

    // Start & end markers (first point of first seg, last point of last seg)
    if (toggleMarkersCb.checked) {
      addStartEndMarkers();
    }

    // Point numbers
    if (togglePointNums.checked) {
      addPointNumberMarkers();
    }

    // Fit bounds to all polylines
    fitRiver();

    return Math.round(performance.now() - t0);
  }

  function addStartEndMarkers() {
    if (allPaths.length === 0) return;

    var startIcon = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;background:#16a34a;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
      iconSize: [14, 14], iconAnchor: [7, 7],
    });
    var endIcon = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;background:#dc2626;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
      iconSize: [14, 14], iconAnchor: [7, 7],
    });

    var firstPt = allPaths[0];
    var lastPt = allPaths[allPaths.length - 1];

    startMarker = L.marker([firstPt[0], firstPt[1]], { icon: startIcon })
      .addTo(map).bindPopup('River Start');
    endMarker = L.marker([lastPt[0], lastPt[1]], { icon: endIcon })
      .addTo(map).bindPopup('River End');
  }

  function addPointNumberMarkers() {
    clearPointNumberMarkers();
    if (allPaths.length === 0) return;

    for (var i = 0; i < allPaths.length; i += POINT_NUMBER_INTERVAL) {
      addNumberedMarker(i);
    }
    // Always mark the last point
    var lastIdx = allPaths.length - 1;
    if (lastIdx > 0 && lastIdx % POINT_NUMBER_INTERVAL !== 0) {
      addNumberedMarker(lastIdx);
    }
  }

  function addNumberedMarker(i) {
    var icon = L.divIcon({
      className: '',
      html: '<div class="point-number-marker">' + i + '</div>',
      iconSize: [22, 22], iconAnchor: [11, 11],
    });
    var pt = allPaths[i];
    var marker = L.marker([pt[0], pt[1]], { icon: icon }).addTo(map);
    marker.bindPopup('#' + i + '<br>Lat: ' + pt[0] + '<br>Lng: ' + pt[1]);
    pointNumberMarkers.push(marker);
  }

  // ═════════════════════════════════════════════════════════
  //  CALCULATIONS
  // ═════════════════════════════════════════════════════════

  function calculateLength() {
    var total = 0;
    for (var i = 1; i < allPaths.length; i++) {
      var a = L.latLng(allPaths[i - 1][0], allPaths[i - 1][1]);
      var b = L.latLng(allPaths[i][0], allPaths[i][1]);
      total += a.distanceTo(b);
    }
    return total / 1000;
  }

  function getBboxString() {
    if (allPaths.length === 0) return '\u2014';
    var bounds = L.latLngBounds(
      allPaths.map(function (p) { return L.latLng(p[0], p[1]); })
    );
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();
    return sw.lat.toFixed(4) + ', ' + sw.lng.toFixed(4) +
           ' \u2192 ' + ne.lat.toFixed(4) + ', ' + ne.lng.toFixed(4);
  }

  function findNearestPoint(latlng) {
    var minDist = Infinity;
    var minIdx = 0;
    for (var i = 0; i < allPaths.length; i++) {
      var d = latlng.distanceTo(L.latLng(allPaths[i][0], allPaths[i][1]));
      if (d < minDist) { minDist = d; minIdx = i; }
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
    infoPoints.textContent = parsed.allPoints.length.toLocaleString();
    infoSegments.textContent = parsed.segmentCount;
    infoLength.textContent = calculateLength().toFixed(2) + ' km';
    infoBbox.textContent = getBboxString();
    infoFetchTime.textContent = fetchTimeMs + ' ms';
    infoRenderTime.textContent = renderTimeMs + ' ms';
    infoPanel.classList.remove('hidden');
    zoomBtn.disabled = false;
  }

  function fitRiver() {
    if (riverPolylines.length === 0) return;
    var allBounds = L.latLngBounds([]);
    riverPolylines.forEach(function (pl) {
      allBounds.extend(pl.getBounds());
    });
    map.fitBounds(allBounds, { padding: [30, 30] });
  }

  function toggleMarkers() {
    if (toggleMarkersCb.checked) {
      if (allPaths.length > 0 && !startMarker) {
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
      if (allPaths.length > 0 && pointNumberMarkers.length === 0) {
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
    var pt = allPaths[idx];
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
      'Total Points: ' + allPaths.length.toLocaleString(),
      'Segments: ' + segmentCount,
      'Path Length: ' + calculateLength().toFixed(2) + ' km',
      'Bounding Box: ' + getBboxString(),
    ].join('\n');

    navigator.clipboard.writeText(text).then(function () {
      showStatus('Copied.', 'success');
    }).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showStatus('Copied.', 'success'); }
      catch (_) { showStatus('Copy failed.', 'error'); }
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
    html2canvas(document.getElementById('map'), {
      useCORS: true, allowTaint: true, scale: 2,
    }).then(function (canvas) {
      var link = document.createElement('a');
      link.download = (currentRiverData ? currentRiverData.slug : 'map') + '_map.png';
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
    e.preventDefault(); dragCounter++;
    dropOverlay.classList.remove('hidden');
  }
  function hideDropOverlay(e) {
    e.preventDefault(); dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.add('hidden'); }
  }

  function handleDrop(e) {
    e.preventDefault(); dragCounter = 0;
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
      try { data = JSON.parse(e.target.result); }
      catch (err) { showStatus('Bad JSON: ' + err.message, 'error'); return; }

      var fetchTimeMs = Math.round(performance.now() - t0);
      try {
        var parsed = parseRiver(data);
        var renderTimeMs = drawRiver(parsed);
        updateInfoPanel(parsed, fetchTimeMs, renderTimeMs);
        showStatus('Loaded ' + parsed.allPoints.length.toLocaleString() + ' points in ' + parsed.segmentCount + ' segments.', 'success');
        urlInput.value = '(file: ' + file.name + ')';
        saveLastUrl('');
      } catch (err) { showStatus(err.message, 'error'); }
    };
    reader.onerror = function () { showStatus('Failed to read file.', 'error'); };
    reader.readAsText(file);
  }

  // ═════════════════════════════════════════════════════════
  //  MAIN HANDLERS
  // ═════════════════════════════════════════════════════════

  async function handleLoad() {
    var url = urlInput.value.trim();
    if (!url) { showStatus('Enter a URL.', 'error'); return; }

    var rawUrl;
    try { rawUrl = convertGithubUrl(url).rawUrl; }
    catch (err) { showStatus(err.message, 'error'); return; }

    showStatus('Fetching...', 'info');

    var fetchResult;
    try { fetchResult = await fetchRiver(rawUrl); }
    catch (err) { showStatus('Fetch failed: ' + err.message, 'error'); return; }

    var parsed;
    try { parsed = parseRiver(fetchResult.data); }
    catch (err) { showStatus(err.message, 'error'); return; }

    try {
      var renderTimeMs = drawRiver(parsed);
      updateInfoPanel(parsed, fetchResult.fetchTimeMs, renderTimeMs);
      showStatus('Loaded ' + parsed.allPoints.length.toLocaleString() + ' points in ' + parsed.segmentCount + ' segments.', 'success');
      saveLastUrl(url);
    } catch (err) { showStatus('Render error: ' + err.message, 'error'); }
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