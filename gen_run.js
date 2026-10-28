// 生成"像真人"的跑道数据流：1 Hz，固定第3道，配速自然波动
const Y = require('./core.js');

const CENTER = { lat: 39.203921, lng: 118.595184 };
const R = 40.2;          // 第3道半径
const L = 84.39;         // 直道长
const ROT = 90;          // 长轴转南北

// 椭圆上按弧长取点
function pointAt(dist) {
  const per = 2 * L + 2 * Math.PI * R;
  let d = ((dist % per) + per) % per;
  let x, y;
  if (d < L) { x = -L / 2 + d; y = -R; }
  else if (d < L + Math.PI * R) { const a = (d - L) / R; x = L / 2 + R * Math.sin(a); y = -R * Math.cos(a); }
  else if (d < 2 * L + Math.PI * R) { x = L / 2 - (d - L - Math.PI * R); y = R; }
  else { const a = (d - 2 * L - Math.PI * R) / R; x = -L / 2 - R * Math.sin(a); y = R * Math.cos(a); }
  return { x, y };
}

// 切向单位向量（用于加横向抖动）
function tangentAt(dist) {
  const a = pointAt(dist - 0.5), b = pointAt(dist + 0.5);
  const dx = b.x - a.x, dy = b.y - a.y;
  const n = Math.hypot(dx, dy) || 1;
  return { tx: dx / n, ty: dy / n, nx: -dy / n, ny: dx / n };
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(opts) {
  const o = Object.assign({
    targetM: 1200, seed: 20261026, hz: 1,
    warmupSec: 60, basePace: 330,   // 秒/公里
    paceNoise: 0.035,               // ±3.5%
    laneJitterM: 0.28,              // 横向抖动上限（米）
    kickPct: 0.05,                  // 最后 10% 加速
    curveSlow: 0.045,               // 弯道降速 4.5%
    gpsNoiseM: 0.25,                // 报点 GPS 噪声（米）
  }, opts || {});
  const rnd = mulberry32(o.seed);
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const out = [];
  let dist = 0, t = 0;
  let paceNoiseState = 0, laneState = 0;
  const dt = 1 / o.hz;
  while (dist < o.targetM) {
    // 配速模型：起步热身 → 稳定 → 末段加速
    const prog = dist / o.targetM;
    let pace = o.basePace;
    if (t < o.warmupSec) {
      const k = t / o.warmupSec;
      pace = o.basePace * (1 + 0.13 * (1 - k));   // 起步慢 13%
    }
    if (prog > 0.9) pace *= (1 - o.kickPct * ((prog - 0.9) / 0.1));
    // 配速噪声（一阶自回归，慢变）
    paceNoiseState = 0.92 * paceNoiseState + 0.39 * gauss();
    pace *= (1 + o.paceNoise * paceNoiseState * 0.5);
    // 弯道判定：直道区间之外就是弯道
    const per0 = 2 * L + 2 * Math.PI * R;
    const dIn = dist % per0;
    const inCurve = !((dIn < L) || (dIn > L + Math.PI * R && dIn < 2 * L + Math.PI * R));
    if (inCurve) pace *= (1 + o.curveSlow);
    const speed = 1000 / pace;                    // m/s
    // 横向抖动（一阶自回归，慢漂移，不是白噪声）
    laneState = 0.95 * laneState + 0.31 * gauss();
    let lat = o.laneJitterM * laneState;
    lat = Math.max(-o.laneJitterM, Math.min(o.laneJitterM, lat));

    const p = pointAt(dist);
    const tg = tangentAt(dist);
    const x = p.x + tg.nx * lat;
    const y = p.y + tg.ny * lat;
    const gTrue = Y.offset(CENTER.lat, CENTER.lng, y, x);
    const gx = o.gpsNoiseM * gauss() * 0.5, gy = o.gpsNoiseM * gauss() * 0.5;
    const g = Y.offset(gTrue.lat, gTrue.lng, gy, gx);

    out.push({
      t: +t.toFixed(2),
      dist: +dist.toFixed(2),
      speed: +speed.toFixed(3),
      pace: +(pace / 60).toFixed(3),
      lat: +g.lat.toFixed(7),
      lng: +g.lng.toFixed(7),
      lane: +lat.toFixed(3),
    });
    dist += speed * dt;
    t += dt;
  }
  return out;
}

module.exports = { generate, pointAt, CENTER, R, L };

if (require.main === module) {
  const args = {};
  process.argv.slice(2).forEach(a => {
    const m = a.match(/^--(\w+)=(.*)$/);
    if (m) args[m[1]] = isNaN(Number(m[2])) ? m[2] : Number(m[2]);
  });
  const seed = args.seed || Math.floor(Math.random() * 1e9);
  const targetM = args.m || 1200;
  const out = args.out || path.join(__dirname, 'run_stream.csv');
  const rows = generate({ targetM, seed });
  const hdr = 't,dist,speed,pace,lat,lng,lane';
  const body = rows.map(r => [r.t, r.dist, r.speed, r.pace, r.lat, r.lng, r.lane].join(',')).join('\n');
  require('fs').writeFileSync(out, hdr + '\n' + body);
  const last = rows[rows.length - 1];
  const paceMin = last.t / (last.dist / 1000) / 60;
  console.log('seed=' + seed, '条数', rows.length, '距离', last.dist.toFixed(0) + 'm',
    '时长', Math.floor(last.t / 60) + '分' + Math.round(last.t % 60) + '秒',
    '配速', Math.floor(paceMin) + "'" + String(Math.round((paceMin % 1) * 60)).padStart(2, '0') + '"');
}
