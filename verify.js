/* verify.js — 内核不变量测试。用法：node verify.js */
const YPC = require('./core.js');

let pass = 0, fail = 0;
const bad = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { fail++; bad.push(name + ' :: ' + detail); console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }
const center = { lat: 39.0000, lng: 118.0000 };
const rng = YPC.makeRng(7);

console.log('\n[1] 预设路线长度收口（fitDistance）');
const presets = {
  '400m 跑道': YPC.presetTrack(center),
  '圆形环路': YPC.presetRound(center, 1500),
  '圆角方形环路': YPC.presetSquare(center, 1600),
  '8 字路线': YPC.presetFigure8(center, 1400),
  '折返': YPC.presetOutBack(center, 1000),
  '随机回环': YPC.presetRandomLoop(rng, center, 1800)
};
for (const [k, pts] of Object.entries(presets)) {
  for (const target of [400, 2000]) {
    const fitted = YPC.fitDistance(pts, target, 'scale');
    const len = YPC.polylineLength(fitted, false);
    ok(k + ' -> ' + target + 'm', near(len, target, target * 0.005), 'len=' + len.toFixed(2));
  }
}

console.log('\n[2] 单圈重复模式（loop）');
{
  const lap = YPC.presetTrack(center);
  const out = YPC.fitDistance(lap, 2000, 'loop');
  const len = YPC.polylineLength(out, false);
  ok('跑道 2km 多圈', near(len, 2000, 20), 'len=' + len.toFixed(1) + '  laps≈' + (len / 400).toFixed(2));
}

console.log('\n[3] 仿真：2km @ 6\'00" 主场景');
let te;
{
  const route = YPC.fitDistance(YPC.presetRandomLoop(YPC.makeRng(42), center, 2000), 2000, 'scale');
  te = YPC.simulate({ routePoints: route, targetPaceSecPerKm: 360, cadenceBase: 168, seed: 20260101, gpsNoiseM: 3 });
  const s = te.summary;
  ok('里程 = 2000m', near(s.distanceM, 2000, 1), s.distanceM + 'm');
  ok('时长约 720s', near(s.durationSec, 720, 60), s.durationSec + 's');
  ok('配速贴合 6\'00"', near(s.avgPaceSecPerKm, 360, 24), YPC.fmtPace(s.avgPaceSecPerKm));
  ok('步频均值合理', s.avgCadenceSpm >= 150 && s.avgCadenceSpm <= 205, s.avgCadenceSpm + ' spm');
  ok('步幅合理', s.strideM >= 0.8 && s.strideM <= 1.3, s.strideM + ' m');
  ok('GPS 轨迹不虚增里程（偏差 ≤ 2.5%）',
    Math.abs(s.gpsDistanceM - s.distanceM) / s.distanceM <= 0.025,
    s.distanceM + 'm vs ' + s.gpsDistanceM + 'm');
  ok('采样点数 ≈ 时长', near(s.sampleCount, s.durationSec + 1, 3), s.sampleCount + ' 点');
  console.log('  ---- 合理性自检 ----');
  for (const c of te.checks) console.log('   ' + (c.pass ? 'PASS' : 'FAIL') + '  ' + c.label + '  →  ' + c.detail);
  ok('全部自检通过', te.checks.every(c => c.pass), te.checks.filter(c => !c.pass).map(c => c.id).join(',') || 'all pass');
}

console.log('\n[4] 可复现性 / 随机性');
{
  const route = YPC.fitDistance(YPC.presetRound(center, 2000), 2000, 'scale');
  const T0 = '2026-03-01T07:00:00.000Z';
  const a = YPC.simulate({ routePoints: route, seed: 5, startTimeIso: T0 });
  const b = YPC.simulate({ routePoints: route, seed: 5, startTimeIso: T0 });
  const c = YPC.simulate({ routePoints: route, seed: 6, startTimeIso: T0 });
  ok('同 seed 完全一致', JSON.stringify(a.points) === JSON.stringify(b.points), 'points 相同');
  ok('不同 seed 结果不同', a.points[20].lat !== c.points[20].lat, '无序随机生效');
}

console.log('\n[5] 极端参数不崩');
{
  for (const pace of [200, 420, 600, 840]) {
    const route = YPC.fitDistance(YPC.presetRound(center, 1200), 1200, 'scale');
    const t = YPC.simulate({ routePoints: route, targetPaceSecPerKm: pace, seed: 11, cadenceBase: 160 });
    const allPass = t.checks.every(x => x.pass);
    ok('配速 ' + YPC.fmtPace(pace) + ' 生成成功且自检通过', t.points.length > 10 && allPass,
      t.summary.distanceM + 'm / ' + t.summary.avgPaceSecPerKm + 's / ' + t.points.length + '点');
  }
  let threw = false;
  try { YPC.simulate({ routePoints: [{ lat: 39, lng: 118 }] }); } catch (e) { threw = true; }
  ok('点数不足时报错', threw, '抛出异常');
}

console.log('\n[6] 分享码往返');
{
  const route = YPC.fitDistance(YPC.presetRandomLoop(YPC.makeRng(9), center, 2000), 2000, 'scale');
  const code = YPC.encodeShare(route, true);
  const back = YPC.decodeShare(code);
  const lenA = YPC.polylineLength(route, false);
  const lenB = YPC.polylineLength(back.points, false);
  let maxDev = 0;
  const dense = YPC.densify(route, 2);
  for (const p of back.points) {
    let best = 1e9;
    for (let i = 0; i < dense.length; i += 3) best = Math.min(best, YPC.haversine(p, dense[i]));
    if (best > maxDev) maxDev = best;
  }
  ok('分享码长度可控', code.length <= 700, code.length + ' 字符 / ' + route.length + '点 → 简化');
  ok('往返长度偏差 ≤ 3%', Math.abs(lenB - lenA) / lenA <= 0.03, lenA.toFixed(1) + 'm → ' + lenB.toFixed(1) + 'm');
  ok('往返逐点偏差 ≤ 8m', maxDev <= 8, maxDev.toFixed(2) + 'm');
  console.log('  分享码示例: ' + code.slice(0, 72) + (code.length > 72 ? '…' : ''));
  let threwBad = false;
  try { YPC.decodeShare('R1@@@@'); } catch (e) { threwBad = true; }
  ok('坏码报错', threwBad);
}

console.log('\n[7] AI 曲线校验（只允许限幅调制，不允许凭空造轨迹）');
{
  ok('合法曲线通过', (() => { try { YPC.validateCadenceProfile({ cadence: [[0, 1], [0.5, 1.1], [1, 1.05]] }); return true; } catch (e) { return false; } })());
  const rejects = [
    ['空对象', {}],
    ['进度越界', { cadence: [[0, 1], [1.4, 1.1]] }],
    ['倍率越界', { cadence: [[0, 1], [1, 3]] }],
    ['进度非递增', { cadence: [[0.5, 1], [0.2, 1.1]] }],
    ['点数过少', { cadence: [[0, 1]] }]
  ];
  for (const [label, p] of rejects) {
    let threw = false;
    try { YPC.validateCadenceProfile(p); } catch (e) { threw = true; }
    ok('拒绝非法曲线：' + label, threw);
  }
  const prof = YPC.validateCadenceProfile({ cadence: [[0, 0.95], [1, 1.08]], pace: [[0, 1.05], [1, 0.97]], note: 'negative split' });
  const route = YPC.fitDistance(YPC.presetRound(center, 2000), 2000, 'scale');
  const t = YPC.simulate({ routePoints: route, aiProfile: prof, seed: 3 });
  ok('AI 曲线生效且自检仍通过', t.meta.aiUsed === true && t.checks.every(c => c.pass), 'cad=' + t.summary.avgCadenceSpm);
}

console.log('\n[8] 导出');
{
  const gpx = YPC.toGPX(te.points, 'test');
  ok('GPX 结构完整', gpx.startsWith('<?xml') && gpx.includes('<trkseg>') && (gpx.match(/<trkpt/g) || []).length === te.points.length, (gpx.match(/<trkpt/g) || []).length + ' trkpt');
  const tgpx = YPC.buildTimedGPX(te.points, 'demo');
  const tCount = (tgpx.match(/<time>/g) || []).length;
  const isoOk = /<time>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z<\/time>/.test(tgpx);
  ok('定时 GPX：点数一致且带 ISO 时间戳', tCount === te.points.length && isoOk, tCount + ' trkpt');
  const rec = YPC.buildRecord(te, { route: { name: 'demo' } });
  ok('记录 schema 正确', rec.schema === 'campus-run-telemetry/1' && rec.samples.length === te.points.length, rec.samples.length + ' samples');
  ok('记录 JSON 可序列化', JSON.stringify(rec).length > 1000, (JSON.stringify(rec).length / 1024).toFixed(1) + ' KB');
}

console.log('\n================ ' + pass + ' passed / ' + fail + ' failed ================');
if (fail) { console.log('失败项：\n' + bad.join('\n')); process.exit(1); }
