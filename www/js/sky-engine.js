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

  /* 太阳当日期分点赤道坐标（度）：黄道线上的太阳位置点用 */
  function sunEqd(date) {
    if (!A) return null;
    var eq = A.Equator(A.Body.Sun, date, makeObserver(DEFAULT_OBS), true, true);
    return { ra: norm360(eq.ra * 15), dec: eq.dec };
  }

  /* 「最暗星等」共用口径（v2.1.0 (2)）：平面星图、今夜可见、相机认星
   * 三处共用同一存档档位（3/4/5/6 等，默认 6），星图页设定、他处跟随。 */
  var MAGLIM_KEY = 'wuri_sky_maglim_v1';
  function magLim() {
    try {
      var v = parseFloat(localStorage.getItem(MAGLIM_KEY));
      if (v === 3 || v === 4 || v === 5 || v === 6) return v;
    } catch (e) {}
    return 6;
  }
  function setMagLim(v) {
    try { localStorage.setItem(MAGLIM_KEY, String(v)); } catch (e) {}
  }

  /* 月亮与五大行星（v2.1.1 合并批）：与 sunAltAz 同路——A.Equator 给出
   * 当日期分点赤道坐标（ra 单位小时），A.Horizon 换地平坐标（带折射）。
   * 名字走 i18n（sx2_body_<id>），此处只存天文标识与呈现色。 */
  var BODIES = [
    { id: 'moon', body: A ? A.Body.Moon : null, kind: 'moon' },
    { id: 'mercury', body: A ? A.Body.Mercury : null, kind: 'planet', color: '#c9ced6' },
    { id: 'venus', body: A ? A.Body.Venus : null, kind: 'planet', color: '#ffd9a3' },
    { id: 'mars', body: A ? A.Body.Mars : null, kind: 'planet', color: '#ff9e66' },
    { id: 'jupiter', body: A ? A.Body.Jupiter : null, kind: 'planet', color: '#ffe3ae' },
    { id: 'saturn', body: A ? A.Body.Saturn : null, kind: 'planet', color: '#eed9a4' }
  ];
  function bodyPos(date, obs, id) {
    if (!A) return null;
    var def = null;
    for (var i = 0; i < BODIES.length; i++) if (BODIES[i].id === id) def = BODIES[i];
    if (!def || !def.body) return null;
    var ob = makeObserver(obs);
    var eq = A.Equator(def.body, date, ob, true, true);
    var h = A.Horizon(date, ob, eq.ra, eq.dec, 'normal');
    return { alt: h.altitude, az: h.azimuth, ra: norm360(eq.ra * 15), dec: eq.dec };
  }


  /* 磁偏角（v2.1.1 (2)）：WMM2025 世界地磁模型（NOAA/BGS 官方，历元
   * 2025.0，有效期 2025–2030）。系数为官方 WMM_2025.COF 全 90 项
   * (n=1..12, m=0..n) 的 [g, h, ġ, ḣ]（nT、nT/年），算法为官方 Geomag
   * 同路：Schmidt 半正规化 Legendre 球谐展开、WGS84 大地→地心转换、
   * 高度取 0。验证锚点（与 NCEI 官方测试值逐项对齐，D/X/Y 全合）：
   * 2025.0 (80,0) D=1.28°、(0,120) D=−0.16°、(−80,240) D=68.78°；
   * 本地抽查 2026-10：St-Hubert −13.66°、伦敦 +1.22°、悉尼 +12.83°。
   * 注：蒙特利尔一带磁偏角近年约 −13.7°（民间常引的「约 15°W」是旧值，
   * 模型两代 WMM2020/2025 在此互差 ≤0.01°）。返回十进制度，东偏为正：
   * 真方位 = 磁方位 + 磁偏角。纯本地计算，不联网。 */
  var WMM2025 = [
    [-29351.8,0,12,0],
    [-1410.8,4545.4,9.7,-21.5],
    [-2556.6,0,-11.6,0],
    [2951.1,-3133.6,-5.2,-27.7],
    [1649.3,-815.1,-8,-12.1],
    [1361,0,-1.3,0],
    [-2404.1,-56.6,-4.2,4],
    [1243.8,237.5,0.4,-0.3],
    [453.6,-549.5,-15.6,-4.1],
    [895,0,-1.6,0],
    [799.5,278.6,-2.4,-1.1],
    [55.7,-133.9,-6,4.1],
    [-281.1,212,5.6,1.6],
    [12.1,-375.6,-7,-4.4],
    [-233.2,0,0.6,0],
    [368.9,45.4,1.4,-0.5],
    [187.2,220.2,0,2.2],
    [-138.7,-122.9,0.6,0.4],
    [-142,43,2.2,1.7],
    [20.9,106.1,0.9,1.9],
    [64.4,0,-0.2,0],
    [63.8,-18.4,-0.4,0.3],
    [76.9,16.8,0.9,-1.6],
    [-115.7,48.8,1.2,-0.4],
    [-40.9,-59.8,-0.9,0.9],
    [14.9,10.9,0.3,0.7],
    [-60.7,72.7,0.9,0.9],
    [79.5,0,-0,0],
    [-77,-48.9,-0.1,0.6],
    [-8.8,-14.4,-0.1,0.5],
    [59.3,-1,0.5,-0.8],
    [15.8,23.4,-0.1,0],
    [2.5,-7.4,-0.8,-1],
    [-11.1,-25.1,-0.8,0.6],
    [14.2,-2.3,0.8,-0.2],
    [23.2,0,-0.1,0],
    [10.8,7.1,0.2,-0.2],
    [-17.5,-12.6,0,0.5],
    [2,11.4,0.5,-0.4],
    [-21.7,-9.7,-0.1,0.4],
    [16.9,12.7,0.3,-0.5],
    [15,0.7,0.2,-0.6],
    [-16.8,-5.2,-0,0.3],
    [0.9,3.9,0.2,0.2],
    [4.6,0,-0,0],
    [7.8,-24.8,-0.1,-0.3],
    [3,12.2,0.1,0.3],
    [-0.2,8.3,0.3,-0.3],
    [-2.5,-3.3,-0.3,0.3],
    [-13.1,-5.2,0,0.2],
    [2.4,7.2,0.3,-0.1],
    [8.6,-0.6,-0.1,-0.2],
    [-8.7,0.8,0.1,0.4],
    [-12.9,10,-0.1,0.1],
    [-1.3,0,0.1,0],
    [-6.4,3.3,0,0],
    [0.2,0,0.1,-0],
    [2,2.4,0.1,-0.2],
    [-1,5.3,-0,0.1],
    [-0.6,-9.1,-0.3,-0.1],
    [-0.9,0.4,0,0.1],
    [1.5,-4.2,-0.1,0],
    [0.9,-3.8,-0.1,-0.1],
    [-2.7,0.9,-0,0.2],
    [-3.9,-9.1,-0,-0],
    [2.9,0,0,0],
    [-1.5,0,-0,-0],
    [-2.5,2.9,0,0.1],
    [2.4,-0.6,0,-0],
    [-0.6,0.2,0,0.1],
    [-0.1,0.5,-0.1,-0],
    [-0.6,-0.3,0,-0],
    [-0.1,-1.2,-0,0.1],
    [1.1,-1.7,-0.1,-0],
    [-1,-2.9,-0.1,0],
    [-0.2,-1.8,-0.1,0],
    [2.6,-2.3,-0.1,0],
    [-2,0,0,0],
    [-0.2,-1.3,0,-0],
    [0.3,0.7,-0,0],
    [1.2,1,-0,-0.1],
    [-1.3,-1.4,-0,0.1],
    [0.6,-0,-0,-0],
    [0.6,0.6,0.1,-0],
    [0.5,-0.1,-0,-0],
    [-0.1,0.8,0,0],
    [-0.4,0.1,0,-0],
    [-0.2,-1,-0.1,-0],
    [-1.3,0.1,-0,0],
    [-0.7,0.2,-0.1,-0.1]
  ];
  function declination(lat, lon, date) {
    date = date || new Date();
    var y = date.getFullYear();
    var t = y + (date.getTime() - new Date(y, 0, 1).getTime()) /
      (new Date(y + 1, 0, 1).getTime() - new Date(y, 0, 1).getTime());
    var dt = t - 2025.0;
    var N = 12, SZ = N + 1;
    /* 系数按 (n,m) 展开并做 Schmidt 半正规化（与官方 _load 同递推） */
    var G = [], DG = [], SN = [], K = [], i, n, m;
    for (i = 0; i < SZ * SZ; i++) { G.push(0); DG.push(0); SN.push(0); K.push(0); }
    var idx = function (nn, mm) { return nn + mm * SZ; };
    var p = 0;
    for (n = 1; n <= N; n++) for (m = 0; m <= n; m++) {
      var r = WMM2025[p++];
      G[idx(m, n)] = r[0]; DG[idx(m, n)] = r[2];
      if (m > 0) { G[idx(n, m - 1)] = r[1]; DG[idx(n, m - 1)] = r[3]; }
    }
    /* h 与 ĥ 存于同一阵的转置位（官方口径），故 c/cd 即 G/DG 本阵 */
    var c = G, cd = DG;
    SN[0] = 1;
    for (n = 1; n <= N; n++) {
      SN[idx(n, 0)] = SN[idx(n - 1, 0)] * (2 * n - 1) / n;
      var j = 2;
      for (m = 0; m <= n; m++) {
        K[idx(m, n)] = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
        if (m > 0) {
          var flnmj = (n - m + 1) * j / (n + m);
          SN[idx(n, m)] = SN[idx(n, m - 1)] * Math.sqrt(flnmj);
          j = 1;
          c[idx(n, m - 1)] *= SN[idx(n, m)]; cd[idx(n, m - 1)] *= SN[idx(n, m)];
        }
        c[idx(m, n)] *= SN[idx(n, m)]; cd[idx(m, n)] *= SN[idx(n, m)];
      }
    }
    K[idx(1, 1)] = 0;
    /* 大地坐标 → 地心球坐标（WGS84） */
    var a = 6378.137, b = 6356.7523142, re = 6371.2;
    var a2 = a * a, b2 = b * b, c2 = a2 - b2, a4 = a2 * a2, c4 = a4 - b2 * b2;
    var alt = 0;
    var rlon = lon * D2R, rlat = lat * D2R;
    var srlon = Math.sin(rlon), crlon = Math.cos(rlon);
    var srlat = Math.sin(rlat), crlat = Math.cos(rlat);
    var srlat2 = srlat * srlat, crlat2 = crlat * crlat;
    var q = Math.sqrt(a2 - c2 * srlat2);
    var q1 = alt * q;
    var q2 = ((q1 + a2) / (q1 + b2)) * ((q1 + a2) / (q1 + b2));
    var ct = srlat / Math.sqrt(q2 * crlat2 + srlat2);
    var st = Math.sqrt(1 - ct * ct);
    var r2 = alt * alt + 2 * q1 + (a4 - c4 * srlat2) / (q * q);
    var r = Math.sqrt(r2);
    var d = Math.sqrt(a2 * crlat2 + b2 * srlat2);
    var ca = (alt + d) / r, sa = c2 * crlat * srlat / (r * d);
    /* sin/cos(mλ) 递推 */
    var sp = [0, srlon], cp = [1, crlon], pp = [1];
    for (m = 2; m <= N; m++) {
      sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1];
      cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1];
    }
    /* 球谐累加（P 起始 = SN 阵，与官方同布局） */
    var P = SN.slice(), DP = [];
    for (i = 0; i < SZ * SZ; i++) DP.push(0);
    var fn = [], fm = [];
    for (n = 0; n <= N; n++) { fn[n] = n + 1; fm[n] = n; }
    var aor = re / r, ar = aor * aor, br = 0, bt = 0, bp = 0, bpp = 0;
    for (n = 1; n <= N; n++) {
      ar *= aor;
      for (m = 0; m <= n; m++) {
        if (n === m) {
          P[idx(n, m)] = st * P[idx(n - 1, m - 1)];
          DP[idx(m, n)] = st * DP[idx(m - 1, n - 1)] + ct * P[idx(n - 1, m - 1)];
          /* 注：DP/P 在官方实现里随后被覆写为新值，上式右端须用旧值——
           * JS 里 P[idx(n-1,m-1)] 未被本轮改动，DP 右端第二项官方取的是
           * 覆写前的 P[n-1][m-1]，此处 P 尚未覆写该位，口径一致 */
        } else if (n === 1 && m === 0) {
          P[idx(n, m)] = ct * P[idx(n - 1, m)];
          DP[idx(m, n)] = ct * DP[idx(m, n - 1)] - st * P[idx(n - 1, m)];
        } else if (n > 1) {
          var pnm2 = (m > n - 2) ? 0 : P[idx(n - 2, m)];
          var dpnm2 = (m > n - 2) ? 0 : DP[idx(m, n - 2)];
          var pold = P[idx(n - 1, m)];
          P[idx(n, m)] = ct * pold - K[idx(m, n)] * pnm2;
          DP[idx(m, n)] = ct * DP[idx(m, n - 1)] - st * pold - K[idx(m, n)] * dpnm2;
        }
        var tg = c[idx(m, n)] + dt * cd[idx(m, n)];
        var th = (m > 0) ? (c[idx(n, m - 1)] + dt * cd[idx(n, m - 1)]) : 0;
        var temp1, temp2;
        if (m === 0) { temp1 = tg * cp[m]; temp2 = tg * sp[m]; }
        else { temp1 = tg * cp[m] + th * sp[m]; temp2 = tg * sp[m] - th * cp[m]; }
        bt -= ar * temp1 * DP[idx(m, n)];
        var par = ar * P[idx(n, m)];
        bp += fm[m] * temp2 * par;
        br += fn[n] * temp1 * par;
        if (st === 0 && m === 1) {
          if (n === 1) pp[n] = pp[n - 1];
          else pp[n] = ct * pp[n - 1] - K[idx(m, n)] * pp[n - 2];
          bpp += fm[m] * temp2 * ar * pp[n];
        }
      }
    }
    if (st === 0) bp = bpp; else bp /= st;
    var bx = -bt * ca - br * sa;
    var by = bp;
    return Math.atan2(by, bx) / D2R;
  }

  /* ---------------- 包内数据双通道加载（v2.1.1 (4)） ----------------
   * 背景：原生壳（国内版/Play 版）以 file:///android_asset 打开页面，
   * Android WebView 的 fetch 走现代 CORS：file:// 源不透明，旧
   * WebSettings 标志（AllowFileAccessFromFileURLs 等）只放行 XHR，
   * 不放行 fetch——星象 data/*.json 在真机上必然加载失败
   * （2026-10-25 真机报障；经文时间码走 XHR 一直正常即对照组）。
   * 口径：https 下 fetch 优先（网页版行为与旧版一致）；fetch 失败或
   * file:// 协议下改走 XHR（file:// 成功时 status 为 0，按成功处理）；
   * JSON 解析失败同样算失败、由调用方走既有报错/重试路径。
   * starData() 是星象三模块（stars / sky-chart / sky-ar）共用的同一份
   * 加载结果：xingguan.json 全 App 只拉一次，先到者建、后到者共享，
   * 不得再有第二条读包内数据的路径。 */
  function loadJSON(url) {
    function viaXHR() {
      return new Promise(function (resolve, reject) {
        var x = new XMLHttpRequest();
        x.open('GET', url, true);
        x.onreadystatechange = function () {
          if (x.readyState !== 4) return;
          if (x.status === 200 || x.status === 0) {
            try { resolve(JSON.parse(x.responseText)); }
            catch (e) { reject(e); }
          } else reject(new Error('xhr http ' + x.status));
        };
        x.onerror = function () { reject(new Error('xhr error')); };
        x.send(null);
      });
    }
    var isFile = (typeof location !== 'undefined' && location.protocol === 'file:');
    if (isFile) return viaXHR();
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).catch(function () { return viaXHR(); });
  }
  var starDataPromise = null;
  function starData() {
    if (starDataPromise) return starDataPromise;
    starDataPromise = Promise.all([
      loadJSON('data/xingguan.json'),
      loadJSON('data/xingguan-lines.json').catch(function () { return null; })
    ]).then(function (res) {
      return { xg: res[0], lines: res[1] };
    }).catch(function (e) { starDataPromise = null; throw e; });
    return starDataPromise;
  }

  global.WuriSky = {
    available: !!A,
    loadJSON: loadJSON,
    starData: starData,
    DEFAULT_OBS: DEFAULT_OBS,
    eqdOf: eqdOf,
    altAz: altAz,
    projectAll: projectAll,
    lstDeg: lstDeg,
    eqdFromAltAz: eqdFromAltAz,
    sunAltAz: sunAltAz,
    sunEqd: sunEqd,
    astroDusk: astroDusk,
    magLim: magLim,
    setMagLim: setMagLim,
    BODIES: BODIES,
    bodyPos: bodyPos,
    declination: declination
  };
})(typeof window !== 'undefined' ? window : globalThis);
