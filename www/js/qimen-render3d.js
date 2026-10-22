/* ============================================================
 * 戊日不上香 · 奇门遁甲模块（适配版）
 * 原作：「掌上乾坤 · 奇门遁甲助手」v3.2，作者 qzp001，MIT License。
 * 许可证全文见同目录 qimen-LICENSE.txt；「我的 → 关于」页有鸣谢。
 * 戊日适配点见各文件头注与 qimen-build/build_qimen.py。
 * ============================================================ */
/* ===== 渲染层 v3.2：星穹 + 九宫 3D 倾斜 + 统一调度器 =====
   设计约束：
   1. 零依赖、零外链，全部本地计算
   2. 任何能力不可用时只降级观感，不减少功能
   3. 所有动效走同一个 rAF 队列，页面隐藏即停
   4. 不修改任何布局尺寸（只用 transform / opacity）
*/
(function () {
  "use strict";
  /* 戊日适配：原作把 lite/no-3d/no-sky 状态类挂在 <html> 上，戊日里改挂 #qm-root */
  function qmRoot() { return document.getElementById("qm-root"); }

  var qs = new URLSearchParams(location.search);
  var flag = function (k) { return qs.get(k) === "1"; };
  var FORCE_LITE = flag("lite");
  var NO3D = FORCE_LITE || flag("no3d");
  var PREFERS_REDUCE = false;
  try { PREFERS_REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var CAN_HOVER = true;
  try { CAN_HOVER = matchMedia("(hover: hover) and (pointer: fine)").matches; } catch (e) {}
  var IS_SMALL = false;
  try { IS_SMALL = matchMedia("(max-width: 720px)").matches; } catch (e) {}

  /* ---------- 统一调度器：一个 rAF 管所有动效 ---------- */
  var FX = (function () {
    var q = new Set();
    var raf = 0;
    var last = 0;
    var fps = IS_SMALL ? 30 : 60;

    function tick(t) {
      raf = 0;
      if (document.hidden) return;
      if (t - last < 1000 / fps - 1) { raf = requestAnimationFrame(tick); return; }
      last = t;
      var batch = Array.from(q);
      q.clear();
      for (var i = 0; i < batch.length; i++) {
        try { batch[i](t); } catch (e) { /* 单个动效失败不拖垮整帧 */ }
      }
      if (q.size) raf = requestAnimationFrame(tick);
    }
    return {
      add: function (fn) {
        if (FORCE_LITE || PREFERS_REDUCE) return;
        q.add(fn);
        if (!raf) raf = requestAnimationFrame(tick);
      },
      stop: function () {
        if (raf) cancelAnimationFrame(raf);
        raf = 0; q.clear();
      }
    };
  })();

  /* ---------- 能力探测 ---------- */
  var CAP = {
    canvas: (function () {
      try { return !!document.createElement("canvas").getContext("2d"); } catch (e) { return false; }
    })(),
    css3d: (function () {
      try {
        return !!(window.CSS && CSS.supports && CSS.supports("transform-style", "preserve-3d"));
      } catch (e) { return false; }
    })()
  };

  /* ---------- 星穹：静态星点离屏预渲染 + 视差 ---------- */
  function initStars() {
    var cv = document.getElementById("qm-sky");
    if (!cv) return;
    if (FORCE_LITE || !CAP.canvas) {
      qmRoot().classList.add("no-sky");
      return;
    }

    var ctx = cv.getContext("2d");
    if (!ctx) { qmRoot().classList.add("no-sky"); return; }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var layer = document.createElement("canvas");
    var lc = layer.getContext("2d");
    var count = IS_SMALL ? 90 : 220;
    var mx = 0, my = 0;

    function build() {
      /* 星色随主题取色：夜间奶油白；亮主题暖灰金
         （原作写死奶油色，在宣纸底上几乎不可见——亮主题「动画没了」的主因之一） */
      var dayInk = document.documentElement.getAttribute("data-theme") !== "night";
      var ink = dayInk ? "146,120,70" : "232,226,208";
      var inkMul = dayInk ? 0.85 : 1;
      W = Math.max(1, window.innerWidth);
      H = Math.max(1, window.innerHeight);
      cv.width = Math.floor(W * dpr);
      cv.height = Math.floor(H * dpr);
      cv.style.width = W + "px";
      cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      layer.width = cv.width;
      layer.height = cv.height;
      lc.setTransform(dpr, 0, 0, dpr, 0, 0);
      lc.clearRect(0, 0, W, H);

      /* 星点分布：偏上密、偏下疏，避免压住盘面文字 */
      for (var i = 0; i < count; i++) {
        var x = Math.random() * W;
        var y = Math.pow(Math.random(), 0.72) * H;
        var r = [0.45, 0.7, 1.0, 1.5][Math.floor(Math.random() * 4)];
        var a = [0.22, 0.4, 0.62][Math.floor(Math.random() * 3)];
        lc.beginPath();
        lc.arc(x, y, r, 0, Math.PI * 2);
        lc.fillStyle = "rgba(" + ink + "," + (a * inkMul).toFixed(3) + ")";
        lc.fill();
      }
      /* 少量暖色星，呼应鎏金 */
      for (var j = 0; j < Math.round(count / 12); j++) {
        lc.beginPath();
        lc.arc(Math.random() * W, Math.pow(Math.random(), 0.7) * H, 1.1, 0, Math.PI * 2);
        lc.fillStyle = dayInk ? "rgba(176,141,60,.6)" : "rgba(242,220,150,.55)";
        lc.fill();
      }
      paint();
    }

    function paint() {
      ctx.clearRect(0, 0, W, H);
      /* 位移时多铺 8px，防止边缘露底 */
      ctx.drawImage(layer, -8 - mx, -8 - my, W + 16, H + 16);
    }

    var rt = 0;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(build, 180);
    }, { passive: true });

    if (CAN_HOVER && !PREFERS_REDUCE) {
      window.addEventListener("mousemove", function (e) {
        mx = (e.clientX / W - 0.5) * 14;
        my = (e.clientY / H - 0.5) * 14;
        FX.add(paint);
      }, { passive: true });
    }

    build();

    /* 主题切换时按新主题星色重建星层 */
    if (window.MutationObserver) {
      new MutationObserver(function () { build(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
  }

  /* ---------- 九宫 3D：鼠标微倾（激进档） ---------- */
  function initTilt() {
    if (NO3D || !CAP.css3d || !CAN_HOVER || PREFERS_REDUCE) return;
    var plate = qmRoot().querySelector(".plate");
    if (!plate) return;

    var base = parseFloat(getComputedStyle(qmRoot()).getPropertyValue("--tilt")) || 19;
    var rx = base, ry = 0, trx = base, tryy = 0;
    var active = false;

    function step() {
      rx += (trx - rx) * 0.14;
      ry += (tryy - ry) * 0.14;
      plate.style.setProperty("--rx", rx.toFixed(2) + "deg");
      plate.style.setProperty("--ry", ry.toFixed(2) + "deg");
      if (Math.abs(trx - rx) > 0.04 || Math.abs(tryy - ry) > 0.04) FX.add(step);
    }

    plate.addEventListener("mousemove", function (e) {
      var r = plate.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      /* 激进：横向 ±6°，纵向 +5°（19°→24°） */
      plate._qmPtrAt = performance.now();
      tryy = px * 12;
      trx = base + py * 10;
      if (trx > 24) trx = 24;
      if (trx < 14) trx = 14;
      active = true;
      FX.add(step);
    }, { passive: true });

    plate.addEventListener("mouseleave", function () {
      if (!active) return;
      active = false;
      tryy = 0;
      trx = base;
      FX.add(step);
    }, { passive: true });
  }

  /* ---------- 九宫闲置轻摆：触屏无鼠标驱动，原作的倾斜/视差在手机上永不触发，
   * 盘面完全静止。此处在指针闲置 2.6s 后以同一套 --rx/--ry 变量做小幅正弦轻摆，
   * 幅度渐入；指针一动即让位（_qmPtrAt 时间戳）；动效关/lite/减动效时不启动。
   * 仍走 FX 调度器，只写 transform 变量，不改布局。 ---------- */
  function initIdleSway() {
    if (NO3D || !CAP.css3d || PREFERS_REDUCE) return;
    var root = qmRoot();
    var plate = root.querySelector(".plate");
    if (!plate) return;
    function sway(t) {
      if (root.classList.contains("lite") || root.getAttribute("data-motion") === "off") return;
      if (plate.getClientRects().length) {
        var idleFor = t - (plate._qmPtrAt || 0);
        if (idleFor > 2600) {
          var ramp = Math.min(1, (idleFor - 2600) / 1800);
          var base = parseFloat(getComputedStyle(root).getPropertyValue("--tilt")) || 19;
          plate.style.setProperty("--ry", (Math.sin(t / 2400) * 2.3 * ramp).toFixed(2) + "deg");
          plate.style.setProperty("--rx", (base + Math.sin(t / 3100) * 1.0 * ramp).toFixed(2) + "deg");
        }
      }
      FX.add(sway);
    }
    FX.add(sway);
  }

  /* ---------- 弹窗焦点管理 ---------- */
  var lastFocus = null;
  function trapFocus(on) {
    var modal = document.getElementById("qm-modal");
    if (!modal) return;
    if (on) {
      lastFocus = document.activeElement;
      var sheet = modal.querySelector(".sheet");
      var f = sheet && sheet.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (f) f.focus();
    } else if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus(); } catch (e) {}
    }
  }

  /* ---------- 启动 ---------- */
  function boot() {
    if (FORCE_LITE) qmRoot().setAttribute("data-motion", "off");
    if (!CAP.css3d || NO3D) qmRoot().classList.add("no-3d");
    initStars();
    initTilt();
    initIdleSway();

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) FX.stop();
    });

    /* 省电开关（写入偏好，失败静默） */
    var btn = document.getElementById("qm-btnLite");
    if (btn) {
      var saved = null;
      try { saved = localStorage.getItem("qm_lite"); } catch (e) {}
      if (saved === "1") {
        qmRoot().setAttribute("data-motion", "off");
        qmRoot().classList.add("lite");
        btn.setAttribute("aria-pressed", "true");
        btn.textContent = "动效：关";
      }
      btn.addEventListener("click", function () {
        var off = qmRoot().getAttribute("data-motion") === "off";
        if (off) {
          qmRoot().removeAttribute("data-motion");
          qmRoot().classList.remove("lite");
          btn.textContent = "动效：开";
          btn.setAttribute("aria-pressed", "false");
        } else {
          qmRoot().setAttribute("data-motion", "off");
          qmRoot().classList.add("lite");
          btn.textContent = "动效：关";
          btn.setAttribute("aria-pressed", "true");
        }
        try { localStorage.setItem("qm_lite", off ? "0" : "1"); } catch (e) {}
      });
    }
  }

  window.QMFX = { add: FX.add, stop: FX.stop, trapFocus: trapFocus, cap: CAP, lite: FORCE_LITE, no3d: NO3D };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
