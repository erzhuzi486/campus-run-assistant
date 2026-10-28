const fs = require('fs');
const path = require('path');
const Y = require('./core.js');
const argFile = process.argv[2];
const logPath = argFile ? path.resolve(argFile) : path.join(__dirname, 'long_log.txt');
if (!fs.existsSync(logPath)) { console.error('找不到日志: ' + logPath); process.exit(1); }
const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
let maxE=0,sum=0,n=0;
for (const l of lines) {
  const [i,tgt,act] = l.split('|');
  if (!tgt||!act||!act.includes(',')) continue;
  const [tlat,tlng]=tgt.split(',').map(Number);
  const [alat,alng]=act.split(',').map(Number);
  const e=Y.haversine({lat:tlat,lng:tlng},{lat:alat,lng:alng});
  maxE=Math.max(maxE,e); sum+=e; n++;
  console.log('  ['+i+'] '+e.toFixed(3)+' m');
}
console.log('\n3km 长跑：抽样 '+n+' 次  最大误差 '+maxE.toFixed(3)+' m  平均 '+(sum/n).toFixed(3)+' m');
