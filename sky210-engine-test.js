/* 二期一步 · 投影引擎锚点验算（Node）
 * 被测：www/js/vendor/astronomy.js（Astronomy Engine 2.1.19, MIT）
 * 对照：本文件内独立实现的 Meeus 公式链（GMST + IAU1976 岁差 + 时角→地平），不调用被测库。
 * 数据：生产数据 www/data/xingguan.json 中「北斗」官七星（BSC5 J2000）。
 * 观测地：St-Hubert, QC  lat 45.5122, lon -73.4253；时刻：2026-10-24T02:00:00Z（=10-23 22:00 EDT）。
 * 另验：SearchAltitude 求天文暮光终了（太阳 −18°）。
 * 关键口径（实测确证）：Astronomy Engine 的 Horizon() 把入参 ra/dec 当作
 * 当日期分点坐标（EQD），本身不做岁差——与「不岁差手算」逐位吻合即为证。
 * 故引擎层必须先用 Rotation_EQJ_EQD 把 J2000（EQJ）坐标转到 EQD 再喂 Horizon。*/
'use strict';
const fs = require('fs');
const A = require('/home/hatch/workspace/wuri-web/www/js/vendor/astronomy.js');
const XG = JSON.parse(fs.readFileSync('/home/hatch/workspace/wuri-web/www/data/xingguan.json', 'utf8'));

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const norm = x => ((x % 360) + 360) % 360;

/* ---------- 独立实现（对照组） ---------- */
function gmstDeg(jd) {
  const T = (jd - 2451545.0) / 36525;
  return norm(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000);
}
function precess(raDeg, decDeg, jd) { // J2000 -> of-date, IAU1976 (Meeus 21), 不含章动
  const T = (jd - 2451545.0) / 36525;
  const zeta = (2306.2181 + 1.39656 * T - 0.000139 * T * T) * T + (0.30188 - 0.000345 * T) * T * T + 0.017998 * T * T * T; // 角秒
  const z = (2306.2181 + 1.39656 * T - 0.000139 * T * T) * T + (1.09468 + 0.000066 * T) * T * T + 0.018203 * T * T * T;
  const theta = (2004.3109 - 0.85330 * T - 0.000217 * T * T) * T - (0.42665 + 0.000217 * T) * T * T - 0.041833 * T * T * T;
  const A1 = Math.cos(decDeg * D2R) * Math.sin((raDeg + zeta / 3600) * D2R);
  const B1 = Math.cos(theta / 3600 * D2R) * Math.cos(decDeg * D2R) * Math.cos((raDeg + zeta / 3600) * D2R) - Math.sin(theta / 3600 * D2R) * Math.sin(decDeg * D2R);
  const C1 = Math.sin(theta / 3600 * D2R) * Math.cos(decDeg * D2R) * Math.cos((raDeg + zeta / 3600) * D2R) + Math.cos(theta / 3600 * D2R) * Math.sin(decDeg * D2R);
  const ra2 = Math.atan2(A1, B1) * R2D + z / 3600;
  const dec2 = Math.asin(C1) * R2D;
  return [norm(ra2), dec2];
}
function altAzIndep(raDeg, decDeg, date, lat, lon) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const [ra, dec] = precess(raDeg, decDeg, jd);
  let H = norm(gmstDeg(jd) + lon - ra); if (H > 180) H -= 360;
  const up = Math.sin(dec * D2R) * Math.sin(lat * D2R) + Math.cos(dec * D2R) * Math.cos(lat * D2R) * Math.cos(H * D2R);
  const north = Math.sin(dec * D2R) * Math.cos(lat * D2R) - Math.cos(dec * D2R) * Math.sin(lat * D2R) * Math.cos(H * D2R);
  const east = -Math.cos(dec * D2R) * Math.sin(H * D2R);
  return { alt: Math.asin(up) * R2D, az: norm(Math.atan2(east, north) * R2D) };
}

/* ---------- 被测 ---------- */
const LAT = 45.5122, LON = -73.4253;
const obs = new A.Observer(LAT, LON, 0);
const when = new Date('2026-10-24T02:00:00Z');
const bd = XG.asterisms.find(a => a.name === '北斗');
console.log('北斗官 stars:', bd.stars.length, ' section:', bd.section);
/* 库 EQJ->EQD（Horizon 本身不做岁差，引擎层须先转，见文件头注） */
function eqdOf(raDeg, decDeg, date) {
  const rot = A.Rotation_EQJ_EQD(date);
  const v = A.VectorFromSphere(new A.Spherical(decDeg, raDeg, 1), date);
  const sph = A.SphereFromVector(A.RotateVector(rot, v));
  return [norm(sph.lon), sph.lat];
}
{
  const [kra, kdec] = eqdOf(bd.stars[0].ra_deg, bd.stars[0].dec_deg, when);
  const jd0 = when.getTime() / 86400000 + 2440587.5;
  const [ira, idec] = precess(bd.stars[0].ra_deg, bd.stars[0].dec_deg, jd0);
  console.log('EQD 对照 天樞：库 ra/dec =', kra.toFixed(5), kdec.toFixed(5), ' 独立 =', ira.toFixed(5), idec.toFixed(5));
}
let maxAlt = 0, maxAz = 0;
console.log('星名     库Alt      库Az      独立Alt    独立Az     ΔAlt     ΔAz');
for (const s of bd.stars) {
  if (s.ra_deg == null) continue;
  const [era, edec] = eqdOf(s.ra_deg, s.dec_deg, when);
  const h = A.Horizon(when, obs, era / 15, edec, 0); // refraction=0：纯变换对照
  const i = altAzIndep(s.ra_deg, s.dec_deg, when, LAT, LON);
  let dAz = Math.abs(h.azimuth - i.az); if (dAz > 180) dAz = 360 - dAz;
  const dAlt = Math.abs(h.altitude - i.alt);
  maxAlt = Math.max(maxAlt, dAlt); maxAz = Math.max(maxAz, dAz);
  console.log(
    (s.cn_name || '').padEnd(6),
    h.altitude.toFixed(4).padStart(9), h.azimuth.toFixed(4).padStart(10),
    i.alt.toFixed(4).padStart(10), i.az.toFixed(4).padStart(10),
    dAlt.toFixed(4).padStart(8), dAz.toFixed(4).padStart(8));
}
console.log('MAX ΔAlt =', maxAlt.toFixed(4), '°   MAX ΔAz =', maxAz.toFixed(4), '°');
// 带折射（App 实际口径 'normal'）的差值量级
const s0 = bd.stars[0];
const [sra, sdec] = eqdOf(s0.ra_deg, s0.dec_deg, when);
const hr = A.Horizon(when, obs, sra / 15, sdec, 'normal');
const h0 = A.Horizon(when, obs, sra / 15, sdec, 0);
console.log('折射(normal-0) 对', s0.cn_name, 'Alt 影响 =', (hr.altitude - h0.altitude).toFixed(4), '°');
// 恒星时对照：库 SiderealTime（视恒星时，小时） vs Meeus GMST+简章动
const jd = when.getTime() / 86400000 + 2440587.5;
console.log('库 SiderealTime(h) =', A.SiderealTime(when).toFixed(6), ' Meeus GMST(h) =', (gmstDeg(jd) / 15).toFixed(6));
// 天文暮光终了：2026-10-23 本地正午（16:00Z）起向后搜太阳降到 −18°
const dusk = A.SearchAltitude(A.Body.Sun, obs, -1, new Date('2026-10-23T16:00:00Z'), 2, -18);
console.log('天文暮光终了(UTC) =', dusk ? dusk.date.toISOString() : null);
// 北极星高度 sanity（应 ≈ 纬度 + 当时极星偏移 <1°）
const xgPol = XG.asterisms.find(a => a.name === '北极');
const gou = XG.asterisms.find(a => a.name === '勾陈');
const pol = gou.stars.find(s => s.cn_name === '勾陈一') || gou.stars[0];
const [pra2, pdec2] = eqdOf(pol.ra_deg, pol.dec_deg, when);
const hp = A.Horizon(when, obs, pra2 / 15, pdec2, 0);
console.log('勾陈一（北极星）J2000 dec =', pol.dec_deg);
console.log('勾陈一 Alt =', hp.altitude.toFixed(3), '（纬度', LAT, '，差', (hp.altitude - LAT).toFixed(3), '°）');
