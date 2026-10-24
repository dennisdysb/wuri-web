/* 戊日不上香 · 中国星象二期「投影引擎」（与相机认星共用的地基）
 *
 * 计算层整拿开源库 Astronomy Engine（Don Cross，MIT）：
 *   js/vendor/astronomy.js（第三方原样，未作任何改动；文件头自带 MIT 全文，
 *   另存 js/vendor/LICENSE-astronomy.txt）。本模块只用它的坐标变换部件：
 *   Rotation_EQJ_EQD（岁差/章动）、Horizon（时角→地平）、SiderealTime、
 *   SearchAltitude（太阳高度角搜索，求天文暮光）。
 *
 * 关键口径（2026-10-23 实测确证，见仓库 sky210-engine-test.js）：
 *   Astronomy Engine 的 Horizon() 把入参 ra/dec 当作「当日期分点坐标」
 *   (EQD)，本身不做岁差。故本层一律先以 Rotation_EQJ_EQD 把 BSC5 的
 *   J2000 坐标 (EQJ) 转到当日期分点，再喂 Horizon；折射默认 'normal'。
 *   验算锚点（St-Hubert 45.5122,-73.4253，2026-10-24T02:00Z，北斗七星，
 *   对照独立实现的 Meeus 公式链）：最大 ΔAlt 0.0011°、ΔAz 0.0021°。
 *
 * 输入：时刻 + 观测地经纬度。输出：每星方位角/高度角（自北起算、向东为正，
 * 与 Astronomy Engine 约定一致）、是否在地平线上。纯本地计算，不联网。
 */
(function (global) {
  'use strict';
  var A = global.Astronomy || null;
  var D2R = Math.PI / 180;
  function norm360(x) { x = x % 360; return x < 0 ? x + 360 : x; }

  var DEFAULT_OBS = { name: 'St-Hubert', lat: 45.5122, lon: -73.4253 };

  function makeObserver(obs) { return new A.Observer(obs.lat, obs.lon, obs.height || 0); }

  /* Rotation_EQJ_EQD 只随时变，按分钟缓存，避免批量投影时重复构造 */
  var rotCache = { key: -1, rot: null };
  function rotationFor(date) {
    var key = Math.floor(date.getTime() / 60000);
    if (rotCache.key !== key) rotCache = { key: key, rot: A.Rotation_EQJ_EQD(date) };
    return rotCache.rot;
  }

  /* J2000 (EQJ) → 当日期分点 (EQD)，ra/dec 单位度，ra 归一到 [0,360) */
  function eqdOf(date, raDeg, decDeg) {
    var v = A.VectorFromSphere(new A.Spherical(decDeg, raDeg, 1), date);
    var s = A.SphereFromVector(A.RotateVector(rotationFor(date), v));
    return [norm360(s.lon), s.lat];
  }

  /* 单星地平坐标。refraction 可传 0 关闭（验算用），默认 'normal'。
   * 返回 {alt, az, raEqd, decEqd}；引擎不可用时返回 null。 */
  function altAz(date, obs, raDeg, decDeg, refraction) {
    if (!A) return null;
    var eqd = eqdOf(date, raDeg, decDeg);
    var h = A.Horizon(date, makeObserver(obs), eqd[0] / 15, eqd[1],
      refraction === undefined ? 'normal' : refraction);
    return { alt: h.altitude, az: h.azimuth, raEqd: eqd[0], decEqd: eqd[1] };
  }

  /* 批量投影：stars = [{ra, dec}...]（J2000，度）→ 同序 [{alt, az, raEqd, decEqd}] */
  function projectAll(date, obs, stars) {
    if (!A) return null;
    var ob = makeObserver(obs), rot = rotationFor(date), out = new Array(stars.length);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var v = A.VectorFromSphere(new A.Spherical(s.dec, s.ra, 1), date);
      var sph = A.SphereFromVector(A.RotateVector(rot, v));
      var raE = norm360(sph.lon);
      var h = A.Horizon(date, ob, raE / 15, sph.lat, 'normal');
      out[i] = { alt: h.altitude, az: h.azimuth, raEqd: raE, decEqd: sph.lat };
    }
    return out;
  }

  /* 本地视恒星时（度）：GAST + 经度（东正西负） */
  function lstDeg(date, obs) { return A ? norm360(A.SiderealTime(date) * 15 + obs.lon) : 0; }

  /* 地平坐标 → 当日期分点赤道坐标（度）：星图方位标定、后续相机 AR 共用 */
  function eqdFromAltAz(date, obs, alt, az) {
    var lat = obs.lat * D2R, a = alt * D2R, z = az * D2R;
    var e = Math.cos(a) * Math.sin(z), n = Math.cos(a) * Math.cos(z), u = Math.sin(a);
    var sinDec = n * Math.cos(lat) + u * Math.sin(lat);
    var dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
    var y = -e, x = -n * Math.sin(lat) + u * Math.cos(lat);
    var H = Math.atan2(y, x) / D2R; // 时角（度），RA = LST − H
    return { ra: norm360(lstDeg(date, obs) - H), dec: dec / D2R };
  }

  /* 太阳地平坐标（Equator 给出当日期分点赤经、单位小时） */
  function sunAltAz(date, obs) {
    if (!A) return null;
    var eq = A.Equator(A.Body.Sun, date, makeObserver(obs), true, true);
    var h = A.Horizon(date, makeObserver(obs), eq.ra, eq.dec, 'normal');
    return { alt: h.altitude, az: h.azimuth };
  }

  /* 天文暮光终了：date 所在本地日正午起向后搜太阳降至 −18° 的时刻。
   * 无解（如极昼/极夜季）返回 null，由调用方回落口径处理。 */
  function astroDusk(date, obs) {
    if (!A) return null;
    var noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
    var r = A.SearchAltitude(A.Body.Sun, makeObserver(obs), -1, noon, 2, -18);
    return r ? r.date : null;
  }

  global.WuriSky = {
    available: !!A,
    DEFAULT_OBS: DEFAULT_OBS,
    eqdOf: eqdOf,
    altAz: altAz,
    projectAll: projectAll,
    lstDeg: lstDeg,
    eqdFromAltAz: eqdFromAltAz,
    sunAltAz: sunAltAz,
    astroDusk: astroDusk
  };
})(typeof window !== 'undefined' ? window : globalThis);
