/* core.js — 校园跑路线工坊 · 仿真内核
 * 纯函数、无 DOM 依赖：浏览器用 <script src="core.js"> 加载到 window.YPC，Node 用 require 加载做测试。
 * 说明：这里产出的是「中立遥测记录」，不是任何具体 App 的私有协议。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YPC = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var R_EARTH = 6371008.8;
  var M_PER_DEG_LAT = 110540;
  var M_PER_DEG_LNG_EQ = 111320;

  function rad(d) { return (d * Math.PI) / 180; }
  function deg(r) { return (r * 180) / Math.PI; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smoothstep(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  /* ---------------- 随机数（可复现） ---------------- */
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    var next = mulberry32(seed);
    var spare = null;
    return {
      f: next,
      range: function (a, b) { return a + (b - a) * next(); },
      int: function (a, b) { return a + Math.floor(next() * (b - a + 1)); },
      chance: function (p) { return next() < p; },
      normal: function () {
        if (spare !== null) { var s = spare; spare = null; return s; }
        var u = 0, v = 0;
        while (u === 0) u = next();
        v = next();
        var m = Math.sqrt(-2 * Math.log(u));
        spare = m * Math.sin(2 * Math.PI * v);
        return m * Math.cos(2 * Math.PI * v);
      }
    };
  }

  /* ---------------- 地理 ---------------- */
  function haversine(a, b) {
    var dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    var la1 = rad(a.lat), la2 = rad(b.lat);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function offset(lat, lng, dEast, dNorth) {
    return {
      lat: lat + dNorth / M_PER_DEG_LAT,
      lng: lng + dEast / (M_PER_DEG_LNG_EQ * Math.cos(rad(lat)))
    };
  }

  function toLocal(center, lat, lng) {
    return {
      x: (lng - center.lng) * M_PER_DEG_LNG_EQ * Math.cos(rad(center.lat)),
      y: (lat - center.lat) * M_PER_DEG_LAT
    };
  }

  /* ---------- 坐标系转换 ----------
   * 手机 GPS provider 吃的是 WGS-84；高德显示 GCJ-02、百度显示 BD-09。
   * 直接抄地图上的数字会偏 100–600 m，所以统一先转回 WGS-84。 */
  var GCJ_A = 6378245.0, GCJ_EE = 0.00669342162296594323;

  function outOfChina(lat, lng) {
    return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
  }
  function tLat(x, y) {
    var r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    r += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    r += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320.0 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return r;
  }
  function tLng(x, y) {
    var r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    r += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    r += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return r;
  }
  function wgs2gcj(lat, lng) {
    if (outOfChina(lat, lng)) return { lat: lat, lng: lng };
    var dLat = tLat(lng - 105.0, lat - 35.0), dLng = tLng(lng - 105.0, lat - 35.0);
    var radLat = rad(lat), magic = Math.sin(radLat);
    magic = 1 - GCJ_EE * magic * magic;
    var sm = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sm) * Math.PI);
    dLng = (dLng * 180.0) / (GCJ_A / sm * Math.cos(radLat) * Math.PI);
    return { lat: lat + dLat, lng: lng + dLng };
  }
  function gcj2wgs(lat, lng) {
    if (outOfChina(lat, lng)) return { lat: lat, lng: lng };
    var w = { lat: lat, lng: lng };
    for (var i = 0; i < 3; i++) {
      var g = wgs2gcj(w.lat, w.lng);
      w.lat += lat - g.lat;
      w.lng += lng - g.lng;
    }
    return w;
  }
  function bd09ToGcj(lat, lng) {
    var x = lng - 0.0065, y = lat - 0.006;
    var z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI * 3000.0 / 180.0);
    var th = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI * 3000.0 / 180.0);
    return { lat: z * Math.sin(th), lng: z * Math.cos(th) };
  }
  function toWgs84(lat, lng, sys) {
    var s = String(sys || 'wgs84').toLowerCase();
    if (s === 'gcj02' || s === 'gcj' || s === 'amap' || s === 'gaode') return gcj2wgs(lat, lng);
    if (s === 'bd09' || s === 'bd' || s === 'baidu') {
      var g = bd09ToGcj(lat, lng);
      return gcj2wgs(g.lat, g.lng);
    }
    return { lat: lat, lng: lng };
  }

  function bearing(a, b) {
    var la1 = rad(a.lat), la2 = rad(b.lat), dLng = rad(b.lng - a.lng);
    var y = Math.sin(dLng) * Math.cos(la2);
    var x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }

  function centroid(points) {
    var la = 0, ln = 0;
    for (var i = 0; i < points.length; i++) { la += points[i].lat; ln += points[i].lng; }
    return { lat: la / points.length, lng: ln / points.length };
  }

  function polylineLength(points, closed) {
    var s = 0;
    for (var i = 1; i < points.length; i++) s += haversine(points[i - 1], points[i]);
    if (closed && points.length > 2) s += haversine(points[points.length - 1], points[0]);
    return s;
  }

  function densify(points, stepM) {
    stepM = stepM || 5;
    var out = [{ lat: points[0].lat, lng: points[0].lng, cum: 0 }];
    var cum = 0;
    for (var i = 1; i < points.length; i++) {
      var a = points[i - 1], b = points[i];
      var seg = haversine(a, b);
      if (seg <= 1e-9) continue;
      var n = Math.max(1, Math.ceil(seg / stepM));
      for (var k = 1; k <= n; k++) {
        var f = k / n;
        cum += seg / n;
        out.push({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, cum: cum });
      }
    }
    return out;
  }

  function interpolateAt(samples, d) {
    if (d <= 0) return { lat: samples[0].lat, lng: samples[0].lng };
    var last = samples[samples.length - 1];
    if (d >= last.cum) return { lat: last.lat, lng: last.lng };
    var lo = 0, hi = samples.length - 1;
    while (lo + 1 < hi) {
      var mid = (lo + hi) >> 1;
      if (samples[mid].cum <= d) lo = mid; else hi = mid;
    }
    var a = samples[lo], b = samples[hi];
    var span = b.cum - a.cum;
    var f = span > 0 ? (d - a.cum) / span : 0;
    return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
  }

  /* ---------------- 路线几何 ---------------- */
  function chaikin(points, iters, closed) {
    var pts = points.map(function (p) { return { lat: p.lat, lng: p.lng }; });
    iters = iters || 2;
    for (var it = 0; it < iters; it++) {
      var out = [];
      var n = pts.length;
      if (!closed) out.push(pts[0]);
      var lim = closed ? n : n - 1;
      for (var i = 0; i < lim; i++) {
        var a = pts[i], b = pts[(i + 1) % n];
        out.push({ lat: 0.75 * a.lat + 0.25 * b.lat, lng: 0.75 * a.lng + 0.25 * b.lng });
        out.push({ lat: 0.25 * a.lat + 0.75 * b.lat, lng: 0.25 * a.lng + 0.75 * b.lng });
      }
      if (!closed) out.push(pts[n - 1]);
      pts = out;
    }
    return pts;
  }

  function scalePoints(points, k) {
    var c = centroid(points);
    return points.map(function (p) {
      var e = (p.lng - c.lng) * M_PER_DEG_LNG_EQ * Math.cos(rad(c.lat));
      var n = (p.lat - c.lat) * M_PER_DEG_LAT;
      return offset(c.lat, c.lng, e * k, n * k);
    });
  }

  function scaleToLength(points, targetLen, closed) {
    var pts = points.map(function (p) { return { lat: p.lat, lng: p.lng }; });
    for (var it = 0; it < 5; it++) {
      var cur = polylineLength(pts, closed);
      if (cur <= 1e-6) break;
      var k = targetLen / cur;
      if (Math.abs(k - 1) < 1e-7) break;
      pts = scalePoints(pts, k);
    }
    return pts;
  }

  /* 把路线长度对齐到 targetM。
   * mode='scale'：整体缩放（单圈）；mode='loop'：整圈重复 + 单圈长度微调。 */
  function fitDistance(points, targetM, mode) {
    mode = mode || 'scale';
    if (mode === 'loop') {
      var c = centroid(points);
      var anchor = points[0];
      var rel = points.map(function (p) { return { lat: p.lat, lng: p.lng }; });
      var lapLen = polylineLength(rel, false);
      if (anchor.lat === rel[rel.length - 1].lat && anchor.lng === rel[rel.length - 1].lng) {
        rel = rel.slice(0, rel.length - 1);
      }
      var closedLen = polylineLength(rel.concat([rel[0]]), false);
      var laps = Math.max(1, Math.round(targetM / closedLen));
      var scaled = scaleToLength(rel, targetM / laps, true);
      var lap = scaled.concat([scaled[0]]);
      var out = [];
      for (var i = 0; i < laps; i++) {
        for (var j = 0; j < lap.length; j++) {
          if (i > 0 && j === 0) continue;
          out.push({ lat: lap[j].lat, lng: lap[j].lng });
        }
      }
      return out;
    }
    return scaleToLength(points, targetM, false);
  }

  function perpDist(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len2 = dx * dx + dy * dy;
    if (len2 <= 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
    var t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function simplify(points, tolM) {
    tolM = tolM || 6;
    if (points.length < 3) return points.map(function (p) { return { lat: p.lat, lng: p.lng }; });
    var c = centroid(points);
    var cosL = Math.cos(rad(c.lat));
    var xy = points.map(function (p) {
      return { x: (p.lng - c.lng) * M_PER_DEG_LNG_EQ * cosL, y: (p.lat - c.lat) * M_PER_DEG_LAT };
    });
    var keep = new Array(points.length);
    keep[0] = keep[points.length - 1] = true;
    var stack = [[0, points.length - 1]];
    while (stack.length) {
      var seg = stack.pop(), a = seg[0], b = seg[1];
      var maxD = -1, idx = -1;
      for (var i = a + 1; i < b; i++) {
        var d = perpDist(xy[i], xy[a], xy[b]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > tolM && idx > 0) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
    }
    var out = [];
    for (var k = 0; k < points.length; k++) if (keep[k]) out.push({ lat: points[k].lat, lng: points[k].lng });
    return out;
  }

  /* ---------------- 预设路线 ---------------- */
  function presetTrack(center) {
    /* 标准 400m 跑道几何：直道 84.39m + 弯道半径 36.5m */
    var straight = 84.39, r = 36.5, step = 2.5;
    var pts = [];
    var push = function (x, y) { pts.push(offset(center.lat, center.lng, x, y)); };
    var x;
    for (x = -straight / 2; x <= straight / 2 - 1e-9; x += step) push(x, -r);
    var dTh = step / r;
    for (var th = -Math.PI / 2; th <= Math.PI / 2 + 1e-9; th += dTh) {
      push(straight / 2 + r * Math.cos(th), r * Math.sin(th));
    }
    for (x = straight / 2; x >= -straight / 2 + 1e-9; x -= step) push(x, r);
    for (var th2 = Math.PI / 2; th2 <= 3 * Math.PI / 2 + 1e-9; th2 += dTh) {
      push(-straight / 2 + r * Math.cos(th2), r * Math.sin(th2));
    }
    return pts;
  }

  function presetRound(center, targetM) {
    var r = targetM / (2 * Math.PI);
    var pts = [], n = Math.max(48, Math.round(targetM / 3));
    for (var i = 0; i < n; i++) {
      var th = (i / n) * 2 * Math.PI;
      pts.push(offset(center.lat, center.lng, Math.cos(th) * r, Math.sin(th) * r));
    }
    return pts;
  }

  function presetSquare(center, targetM) {
    /* 圆角矩形环路；实际周长偏差由 fitDistance 收口 */
    var side = targetM / 4;
    var h = side / 2;
    var cr = Math.min(side * 0.22, h * 0.8);
    var pts = [], step = 3;
    var push = function (x, y) { pts.push(offset(center.lat, center.lng, x, y)); };
    var line = function (x0, y0, x1, y1) {
      var len = Math.hypot(x1 - x0, y1 - y0);
      var n = Math.max(2, Math.ceil(len / step));
      for (var i = 1; i <= n; i++) push(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
    };
    var arc = function (cx, cy, a0, a1) {
      var dTh = step / cr;
      for (var th = a0; th <= a1 + 1e-9; th += dTh) push(cx + cr * Math.cos(th), cy + cr * Math.sin(th));
    };
    var r = h - cr;
    push(-r, -h);
    line(-r, -h, r, -h);
    arc(r, -r, -Math.PI / 2, 0);
    line(h, -r, h, r);
    arc(r, r, 0, Math.PI / 2);
    line(r, h, -r, h);
    arc(-r, r, Math.PI / 2, Math.PI);
    line(-h, r, -h, -r);
    arc(-r, -r, Math.PI, 1.5 * Math.PI);
    pts.push(pts[0]);
    return pts;
  }

  function presetFigure8(center, targetM) {
    var a = targetM / 5.2, pts = [], n = 240;
    for (var i = 0; i <= n; i++) {
      var t = (i / n) * 2 * Math.PI;
      var den = 1 + Math.sin(t) * Math.sin(t);
      var x = (a * Math.cos(t)) / den;
      var y = (a * Math.sin(t) * Math.cos(t)) / den;
      pts.push(offset(center.lat, center.lng, x, y));
    }
    return pts;
  }

  function presetRandomLoop(rng, center, targetM) {
    var k = rng.int(8, 13);
    var base = targetM / (2 * Math.PI) * 0.92;
    var raw = [];
    for (var i = 0; i < k; i++) {
      var th = (i / k) * 2 * Math.PI + rng.range(-0.14, 0.14);
      var rr = base * rng.range(0.66, 1.18);
      raw.push(offset(center.lat, center.lng, Math.cos(th) * rr, Math.sin(th) * rr * 0.85));
    }
    raw.push({ lat: raw[0].lat, lng: raw[0].lng });
    var sm = chaikin(raw, 3, false);
    return sm;
  }

  function presetOutBack(center, targetM) {
    var half = targetM / 2;
    var ang = rad(28);
    var pts = [], step = 4;
    for (var d = 0; d <= half; d += step) {
      pts.push(offset(center.lat, center.lng, Math.cos(ang) * d, Math.sin(ang) * d));
    }
    for (var d2 = half; d2 >= 0; d2 -= step) {
      pts.push(offset(center.lat, center.lng, Math.cos(ang) * d2 + 6, Math.sin(ang) * d2 - 4));
    }
    return pts;
  }

  /* ---------------- 仿真 ---------------- */
  function piecewiseMul(list, u) {
    if (!list || !list.length) return 1;
    if (u <= list[0][0]) return list[0][1];
    for (var i = 1; i < list.length; i++) {
      if (u <= list[i][0]) {
        var a = list[i - 1], b = list[i];
        var span = b[0] - a[0];
        var f = span > 1e-9 ? (u - a[0]) / span : 0;
        return a[1] + (b[1] - a[1]) * f;
      }
    }
    return list[list.length - 1][1];
  }

  /* GPS 漂移：用几条低频正弦叠加模拟多径/慢漂移。
   * 相比逐点白噪声，它几乎不虚增轨迹长度（真实的 1Hz GPS 抖动会把 2km 跑成 2.1km）。 */
  function makeDrift(rng, sigma) {
    var comps = [], wsum = 0;
    for (var i = 0; i < 3; i++) {
      var w = rng.range(0.6, 1.4);
      comps.push({ A: w, T: rng.range(35, 190), ph: rng.range(0, Math.PI * 2) });
      wsum += w * w;
    }
    var k = sigma / Math.sqrt(wsum / 2);
    return function (t) {
      var s = 0;
      for (var j = 0; j < comps.length; j++) {
        s += comps[j].A * Math.sin((2 * Math.PI * t) / comps[j].T + comps[j].ph);
      }
      return s * k;
    };
  }

  function simulate(opts) {
    var o = Object.assign({
      routePoints: [],
      targetPaceSecPerKm: 360,
      cadenceBase: 168,
      seed: 20260101,
      startTimeIso: new Date().toISOString(),
      gpsNoiseM: 3,
      hillsM: 2.5,
      baseAltM: 26,
      warmupSec: 150,
      driftPct: 0.045,
      kickPct: 0.05,
      sampleSec: 1,
      aiProfile: null
    }, opts || {});

    var path = (o.routePoints || []).map(function (p) { return { lat: +p.lat, lng: +p.lng }; });
    if (path.length < 2) throw new Error('路线至少需要 2 个点');
    var D = polylineLength(path, false);
    if (!(D > 10)) throw new Error('路线长度过短（' + D.toFixed(1) + 'm）');

    var rng = makeRng(o.seed);
    var samples = densify(path, 4);
    var targetSpeed = 1000 / clamp(o.targetPaceSecPerKm, 150, 1200);
    var dt = clamp(o.sampleSec, 0.5, 10);
    var uWarm = clamp((o.warmupSec * targetSpeed) / D, 0, 0.4);

    function hillM(u) {
      return o.hillsM * (0.62 * Math.sin(2 * Math.PI * (2.0 * u + 0.17)) +
        0.38 * Math.sin(2 * Math.PI * (5.3 * u + 0.61)));
    }
    function gradeAt(u) {
      var h = 1e-4;
      var u1 = Math.min(1, u + h), u2 = Math.max(0, u - h);
      var dh = hillM(u1) - hillM(u2);
      var ds = (u1 - u2) * D;
      return ds > 0 ? dh / ds : 0;
    }
    function gdet(u) {
      var g = 1;
      if (u < uWarm) g *= 0.90 + 0.10 * smoothstep(uWarm > 0 ? u / uWarm : 1);
      g *= 1 - o.driftPct * u;
      if (u > 0.95) g *= 1 + o.kickPct * smoothstep((u - 0.95) / 0.05);
      var gr = gradeAt(u);
      if (gr > 0) g *= 1 - Math.min(0.25, 0.9 * gr);
      else g *= 1 + Math.min(0.10, 0.35 * Math.abs(gr));
      if (o.aiProfile && o.aiProfile.pace) g *= piecewiseMul(o.aiProfile.pace, u);
      return g;
    }

    var N = 800, meanG = 0;
    for (var i = 0; i < N; i++) meanG += gdet((i + 0.5) / N);
    meanG = meanG / N;
    if (!(meanG > 0.2)) meanG = 1;

    var nSpeed = 0, tauSpeed = 9;
    var driftX = makeDrift(rng, o.gpsNoiseM);
    var driftY = makeDrift(rng, o.gpsNoiseM);

    var pts = [];
    var s = 0, t = 0, steps = 0, elevGain = 0, prevAltClean = null;
    var startMs = new Date(o.startTimeIso).getTime();
    var maxSec = clamp(Math.round(D / (targetSpeed * 0.4)), 60, 6 * 3600);
    var guard = 0;

    while (s < D - 1e-6 && t < maxSec && guard < 300000) {
      guard++;
      var u = s / D;
      nSpeed += (-nSpeed / tauSpeed) * dt + 0.030 * Math.sqrt(dt) * rng.normal();
      nSpeed = clamp(nSpeed, -0.12, 0.12);
      var v = targetSpeed * (gdet(u) / meanG) * (1 + nSpeed);
      v = clamp(v, 0.7, 8.5);

      var cadTarget = o.cadenceBase * (0.86 + 0.14 * (v / targetSpeed));
      if (o.aiProfile && o.aiProfile.cadence) cadTarget *= piecewiseMul(o.aiProfile.cadence, u);
      var cad = cadTarget * (1 + 0.022 * rng.normal());
      cad = clamp(cad, 110, 216);
      var stride = v / (cad / 60);
      if (stride > 1.85) { cad = v / (1.85 / 60); stride = 1.85; }
      if (stride < 0.40) { cad = v / (0.40 / 60); stride = 0.40; }
      cad = clamp(cad, 100, 230);

      var tp = interpolateAt(samples, s);
      var gp = offset(tp.lat, tp.lng, driftX(t), driftY(t));
      /* 爬升只在真实地形分量上累计：逐点噪声的随机抖动不该变成"爬升" */
      var altClean = o.baseAltM + hillM(u);
      if (prevAltClean !== null && altClean > prevAltClean) elevGain += altClean - prevAltClean;
      prevAltClean = altClean;
      var alt = altClean + 0.15 * rng.normal();

      var prevTrue = interpolateAt(samples, Math.max(0, s - 3));
      var head = bearing(prevTrue, tp);
      var acc = clamp(o.gpsNoiseM * (0.9 + 0.4 * Math.abs(rng.normal())), 1.5, 12);

      pts.push({
        i: pts.length,
        tSec: +t.toFixed(1),
        ts: startMs + Math.round(t * 1000),
        lat: +gp.lat.toFixed(7),
        lng: +gp.lng.toFixed(7),
        cumM: +s.toFixed(1),
        speedMps: +v.toFixed(2),
        paceSecPerKm: Math.round(1000 / v),
        cadenceSpm: Math.round(cad),
        strideM: +stride.toFixed(2),
        stepsCum: Math.round(steps),
        headingDeg: Math.round(head) % 360,
        altM: +alt.toFixed(1),
        accM: +acc.toFixed(1)
      });

      var ds = v * dt;
      s += ds;
      t += dt;
      steps += (cad / 60) * dt;
    }

    if (pts.length && s < D) {
      var rem = D - (pts[pts.length - 1].cumM);
      var lastV = pts[pts.length - 1].speedMps || targetSpeed;
      t += rem / lastV;
      var endp = interpolateAt(samples, D);
      var lastP = pts[pts.length - 1];
      pts.push({
        i: pts.length, tSec: +t.toFixed(1), ts: startMs + Math.round(t * 1000),
        lat: +endp.lat.toFixed(7), lng: +endp.lng.toFixed(7), cumM: +D.toFixed(1),
        speedMps: lastP.speedMps, paceSecPerKm: lastP.paceSecPerKm,
        cadenceSpm: lastP.cadenceSpm, strideM: lastP.strideM, stepsCum: Math.round(steps),
        headingDeg: lastP.headingDeg, altM: lastP.altM, accM: lastP.accM
      });
    }
    if (!pts.length) throw new Error('仿真未产生任何采样点');

    var gpsDist = 0;
    for (var j = 1; j < pts.length; j++) gpsDist += haversine(pts[j - 1], pts[j]);

    var dur = pts[pts.length - 1].tSec;
    var cadSum = 0, paceSum = 0;
    for (var k = 0; k < pts.length; k++) { cadSum += pts[k].cadenceSpm; paceSum += pts[k].paceSecPerKm; }
    var paces = pts.map(function (p) { return p.paceSecPerKm; });
    var pmin = paces[0], pmax = paces[0];
    for (var m = 1; m < paces.length; m++) { if (paces[m] < pmin) pmin = paces[m]; if (paces[m] > pmax) pmax = paces[m]; }
    var stepsFinal = Math.max(1, Math.round(steps));

    var te = {
      points: pts,
      summary: {
        distanceM: +D.toFixed(1),
        gpsDistanceM: +gpsDist.toFixed(1),
        durationSec: dur,
        avgPaceSecPerKm: Math.round(dur / (D / 1000)),
        fastestPaceSecPerKm: pmin,
        slowestPaceSecPerKm: pmax,
        avgCadenceSpm: Math.round(cadSum / pts.length),
        steps: stepsFinal,
        strideM: +(D / stepsFinal).toFixed(3),
        elevGainM: +elevGain.toFixed(1),
        sampleCount: pts.length,
        startTimeIso: new Date(startMs).toISOString()
      },
      meta: {
        seed: o.seed, gpsNoiseM: o.gpsNoiseM, targetPaceSecPerKm: o.targetPaceSecPerKm,
        cadenceBase: o.cadenceBase, sampleSec: dt, aiUsed: !!(o.aiProfile && (o.aiProfile.pace || o.aiProfile.cadence)),
        engine: 'local'
      }
    };
    te.checks = validate(te, { targetDistanceM: D, targetPaceSecPerKm: o.targetPaceSecPerKm });
    return te;
  }

  /* ---------------- 数据合理性自检（对标校园跑风控关注点） ---------------- */
  function fmtPace(sec) {
    sec = Math.round(sec);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + "'" + (s < 10 ? '0' : '') + s + '"';
  }

  function validate(te, ref) {
    ref = ref || {};
    var p = te.points, out = [];
    function add(id, label, pass, detail) { out.push({ id: id, label: label, pass: !!pass, detail: detail }); }

    var dur = te.summary.durationSec;
    var D = te.summary.distanceM;
    var avgPace = dur / (D / 1000);
    add('pace', '平均配速在人类跑步区间（3\'00"-15\'00"/km）',
      avgPace >= 180 && avgPace <= 900, fmtPace(avgPace) + ' /km');

    var stride = D / te.summary.steps;
    add('stride', '步幅 0.40–1.85 m（距离/步数互相自洽）',
      stride >= 0.40 && stride <= 1.85, stride.toFixed(2) + ' m/步，共 ' + te.summary.steps + ' 步');

    var dev = Math.abs(te.summary.gpsDistanceM - D) / D;
    add('gpslen', 'GPS 轨迹长度与目标里程偏差 ≤ 2.5%',
      dev <= 0.025, '偏差 ' + (dev * 100).toFixed(2) + '%（目标 ' + D.toFixed(0) + 'm / 轨迹 ' + te.summary.gpsDistanceM.toFixed(0) + 'm）');

    var maxHop = 0, maxV = 0, minV = 999, dtBad = 0;
    for (var i = 1; i < p.length; i++) {
      var hop = haversine(p[i - 1], p[i]);
      var dt = p[i].tSec - p[i - 1].tSec;
      if (Math.abs(dt - te.meta.sampleSec) > 0.35) dtBad++;
      if (hop > maxHop) maxHop = hop;
      var v = dt > 0 ? hop / dt : 999;
      if (v > maxV) maxV = v;
      if (v < minV) minV = v;
    }
    add('teleport', '相邻采样点无瞬移（单点位移 < 15m，速度 ≤ 12 m/s）',
      maxHop < 15 && maxV <= 12, '最大位移 ' + maxHop.toFixed(1) + 'm，最大速度 ' + maxV.toFixed(2) + ' m/s');
    add('sampling', '采样间隔稳定（1s ± 0.35s，无断点）',
      dtBad === 0, dtBad === 0 ? p.length + ' 个采样点间隔一致' : dtBad + ' 处间隔异常');

    var cadMin = 999, cadMax = 0, cadSum = 0, cadSq = 0;
    for (var k = 0; k < p.length; k++) {
      var c = p[k].cadenceSpm;
      if (c < cadMin) cadMin = c;
      if (c > cadMax) cadMax = c;
      cadSum += c; cadSq += c * c;
    }
    var cadAvg = cadSum / p.length;
    var cadStd = Math.sqrt(Math.max(0, cadSq / p.length - cadAvg * cadAvg));
    add('cadence', '步频 105–225 spm，波动标准差 ≤ 9（不是死板常数）',
      cadMin >= 105 && cadMax <= 225 && cadStd <= 9,
      cadMin + '–' + cadMax + ' spm，均值 ' + cadAvg.toFixed(1) + '，标准差 ' + cadStd.toFixed(2));

    add('monotonic', '时间与里程单调递增',
      p.every(function (x, idx) { return idx === 0 || (x.tSec > p[idx - 1].tSec && x.cumM >= p[idx - 1].cumM); }),
      '共 ' + p.length + ' 点');

    var accMax = 0;
    for (var q = 0; q < p.length; q++) if (p[q].accM > accMax) accMax = p[q].accM;
    add('accuracy', 'GPS 精度值在合理区间（≤ 12m）', accMax <= 12, '最大 ' + accMax.toFixed(1) + 'm');

    if (ref.targetPaceSecPerKm) {
      var paceDev = Math.abs(avgPace - ref.targetPaceSecPerKm) / ref.targetPaceSecPerKm;
      add('targetpace', '实际配速贴合目标配速（偏差 ≤ 8%）',
        paceDev <= 0.08, fmtPace(ref.targetPaceSecPerKm) + ' → ' + fmtPace(avgPace) + '（' + (paceDev * 100).toFixed(2) + '%）');
    }
    return out;
  }

  /* ---------------- 分享码 ---------------- */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function bytesToB64u(bytes) {
    var out = '', i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    var rest = bytes.length - i;
    if (rest === 1) {
      var n1 = bytes[i] << 16;
      out += B64[(n1 >> 18) & 63] + B64[(n1 >> 12) & 63];
    } else if (rest === 2) {
      var n2 = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64[(n2 >> 18) & 63] + B64[(n2 >> 12) & 63] + B64[(n2 >> 6) & 63];
    }
    return out;
  }
  function b64uToBytes(str) {
    var lut = {};
    for (var i = 0; i < B64.length; i++) lut[B64[i]] = i;
    var bytes = [], buf = 0, bits = 0;
    for (var k = 0; k < str.length; k++) {
      var v = lut[str[k]];
      if (v === undefined) continue;
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 255); }
    }
    return bytes;
  }
  function writeVarint(arr, val) {
    val = val >>> 0;
    while (val >= 128) { arr.push((val & 127) | 128); val = val >>> 7; }
    arr.push(val & 127);
  }
  function readVarint(bytes, pos) {
    var res = 0, shift = 0, b;
    do { b = bytes[pos.i++]; res |= (b & 127) << shift; shift += 7; } while (b & 128);
    return res >>> 0;
  }
  function zig(v) { return v < 0 ? (-v * 2 - 1) >>> 0 : (v * 2) >>> 0; }
  function unzig(v) { return v % 2 === 1 ? -((v + 1) / 2) : v / 2; }

  function encodeShare(points, closed, opts) {
    opts = opts || {};
    var tol = opts.tolM === undefined ? 5 : opts.tolM;
    var src = points.map(function (p) { return { lat: +p.lat, lng: +p.lng }; });
    var pts = simplify(src, tol);
    var bytes = [1, closed ? 1 : 0];
    writeVarint(bytes, pts.length);
    var plat = 0, plng = 0;
    for (var i = 0; i < pts.length; i++) {
      var la = Math.round(pts[i].lat * 1e5);
      var ln = Math.round(pts[i].lng * 1e5);
      writeVarint(bytes, zig(la - plat)); plat = la;
      writeVarint(bytes, zig(ln - plng)); plng = ln;
    }
    return 'R1' + bytesToB64u(bytes);
  }

  function decodeShare(code) {
    if (typeof code !== 'string') throw new Error('分享码为空');
    var c = code.trim().replace(/^#?r=/, '');
    if (c.indexOf('R1') !== 0) throw new Error('分享码版本不支持（应以 R1 开头）');
    var bytes = b64uToBytes(c.slice(2));
    var pos = { i: 0 };
    var ver = bytes[pos.i++];
    if (ver !== 1) throw new Error('分享码版本不识别：' + ver);
    var closed = bytes[pos.i++] === 1;
    var n = readVarint(bytes, pos);
    if (!(n >= 2 && n <= 20000)) throw new Error('分享码点数非法：' + n);
    var pts = [], plat = 0, plng = 0;
    for (var i = 0; i < n; i++) {
      plat += unzig(readVarint(bytes, pos));
      plng += unzig(readVarint(bytes, pos));
      pts.push({ lat: plat / 1e5, lng: plng / 1e5 });
    }
    return { points: pts, closed: closed };
  }

  /* ---------------- 导出 ---------------- */
  function toGPX(points, name) {
    var head = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="CampusRunStudio" xmlns="http://www.topografix.com/GPX/1/1">\n' +
      '<trk><name>' + String(name || 'route').replace(/[<>&]/g, '') + '</name><trkseg>\n';
    var body = '';
    for (var i = 0; i < points.length; i++) {
      body += '<trkpt lat="' + (+points[i].lat).toFixed(6) + '" lon="' + (+points[i].lng).toFixed(6) + '"></trkpt>\n';
    }
    return head + body + '</trkseg></trk>\n</gpx>\n';
  }

  /* 带 <time> 的 GPX：pymobiledevice3 的 simulate-location play 会按时间轴回放，
   * 所以配速曲线会被如实还原成"每秒走多少米"。 */
  /* 带 <time> 的 GPX：给需要按时间轴回放的工具用（也可以直接导出去别的运动软件） */
  function buildTimedGPX(points, name) {
    var esc = function (s) { return String(s == null ? '' : s).replace(/[<>&]/g, ''); };
    var head = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="CampusRunStudio" xmlns="http://www.topografix.com/GPX/1/1">\n' +
      '<trk><name>' + esc(name || 'campus-route') + '</name><trkseg>\n';
    var body = '';
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      body += '<trkpt lat="' + (+p.lat).toFixed(7) + '" lon="' + (+p.lng).toFixed(7) + '">' +
        '<ele>' + (+(p.altM || 0)).toFixed(1) + '</ele>' +
        '<time>' + new Date(p.ts).toISOString() + '</time>' +
        '</trkpt>\n';
    }
    return head + body + '</trkseg></trk>\n</gpx>\n';
  }

  function buildRecord(te, extra) {
    extra = extra || {};
    return {
      schema: 'campus-run-telemetry/1',
      note: '中立遥测格式：字段按常见校园跑 App 的上报项建模，不代表任何具体 App 的私有协议',
      sport: 'run',
      startTime: te.summary.startTimeIso,
      durationSec: te.summary.durationSec,
      distanceM: te.summary.distanceM,
      avgPaceSecPerKm: te.summary.avgPaceSecPerKm,
      steps: te.summary.steps,
      cadence: { avg: te.summary.avgCadenceSpm },
      elevationGainM: te.summary.elevGainM,
      source: 'simulator',
      seed: te.meta.seed,
      aiAssisted: te.meta.aiUsed,
      device: extra.device || null,
      route: extra.route || null,
      samples: te.points.map(function (p) {
        return {
          ts: p.ts, lat: p.lat, lng: p.lng,
          speedMps: p.speedMps, cadenceSpm: p.cadenceSpm,
          accuracyM: p.accM, altitudeM: p.altM, bearingDeg: p.headingDeg
        };
      })
    };
  }

  function validateCadenceProfile(profile) {
    if (!profile || typeof profile !== 'object') throw new Error('AI 返回为空');
    var out = { pace: null, cadence: null, note: '' };
    ['pace', 'cadence'].forEach(function (key) {
      var arr = profile[key];
      if (arr == null) return;
      if (!Array.isArray(arr) || arr.length < 2 || arr.length > 40) throw new Error(key + ' 曲线点数非法');
      var clean = [], prevU = -1;
      for (var i = 0; i < arr.length; i++) {
        var pair = arr[i];
        if (!Array.isArray(pair) || pair.length !== 2) throw new Error(key + ' 第 ' + (i + 1) + ' 项格式错误');
        var u = +pair[0], mul = +pair[1];
        if (!isFinite(u) || !isFinite(mul)) throw new Error(key + ' 第 ' + (i + 1) + ' 项不是数字');
        if (u < 0 || u > 1) throw new Error(key + ' 第 ' + (i + 1) + ' 项进度越界（0–1）');
        if (u <= prevU) throw new Error(key + ' 曲线进度必须严格递增');
        if (mul < 0.6 || mul > 1.5) throw new Error(key + ' 倍率越界（0.6–1.5）');
        prevU = u;
        clean.push([u, mul]);
      }
      out[key] = clean;
    });
    out.note = typeof profile.note === 'string' ? profile.note.slice(0, 200) : '';
    if (!out.pace && !out.cadence) throw new Error('AI 未给出任何可用曲线');
    return out;
  }

  return {
    makeRng: makeRng,
    haversine: haversine,
    offset: offset,
    toLocal: toLocal,
    wgs2gcj: wgs2gcj,
    gcj2wgs: gcj2wgs,
    toWgs84: toWgs84,
    bearing: bearing,
    centroid: centroid,
    polylineLength: polylineLength,
    densify: densify,
    interpolateAt: interpolateAt,
    chaikin: chaikin,
    scalePoints: scalePoints,
    scaleToLength: scaleToLength,
    fitDistance: fitDistance,
    simplify: simplify,
    presetTrack: presetTrack,
    presetRound: presetRound,
    presetSquare: presetSquare,
    presetFigure8: presetFigure8,
    presetRandomLoop: presetRandomLoop,
    presetOutBack: presetOutBack,
    simulate: simulate,
    validate: validate,
    fmtPace: fmtPace,
    encodeShare: encodeShare,
    decodeShare: decodeShare,
    toGPX: toGPX,
    buildTimedGPX: buildTimedGPX,
    buildRecord: buildRecord,
    validateCadenceProfile: validateCadenceProfile
  };
});
