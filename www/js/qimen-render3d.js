/* ============================================================
 * 戊日不上香 · 奇门遁甲模块（适配版）
 * 原作：「掌上乾坤 · 奇门遁甲助手」v3.2，作者 qzp001，MIT License。
 * 许可证全文见同目录 qimen-LICENSE.txt；「我的 → 关于」页有鸣谢。
 * 戊日适配点见各文件头注与 qimen-build/build_qimen.py。
 * ============================================================ */
/* ===== 渲染层 v3.2：星穹（静态） + 九宫 3D 静态倾斜 =====
   设计约束：
   1. 零依赖、零外链，全部本地计算
   2. 任何能力不可用时只降级观感，不减少功能
   3. 盘面静态呈现（2026-10-22 用户验收后决定动效整体下线：闲置轻摆、鼠标微倾、
      星点视差、宫格入场、光晕漂移已全部移除，夜间星点保留为静态绘制）
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
  var IS_SMALL = false;
  try { IS_SMALL = matchMedia("(max-width: 720px)").matches; } catch (e) {}

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

  /* ---------- 星穹：静态星点离屏预渲染（夜间绘制，白天不绘制） ---------- */
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
      /* 星层仅夜间绘制：白天宣纸底上的星点像屏幕落灰（三轮真机反馈），
         day 下清空画布不生成星点（CSS 亦同步隐藏 #qm-sky）；夜间奶油白星色不变。 */
      var dayInk = document.documentElement.getAttribute("data-theme") !== "night";
      var ink = "232,226,208";
      var inkMul = 1;
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

      /* 星点分布：偏上密、偏下疏，避免压住盘面文字（白天不绘制，直接跳过） */
      for (var i = 0; !dayInk && i < count; i++) {
        var x = Math.random() * W;
        var y = Math.pow(Math.random(), 0.72) * H;
        var r = [0.45, 0.7, 1.0, 1.5][Math.floor(Math.random() * 4)];
        var a = [0.22, 0.4, 0.62][Math.floor(Math.random() * 3)];
        lc.beginPath();
        lc.arc(x, y, r, 0, Math.PI * 2);
        lc.fillStyle = "rgba(" + ink + "," + (a * inkMul).toFixed(3) + ")";
        lc.fill();
      }
      /* 少量暖色星，呼应鎏金（白天同样不绘制） */
      for (var j = 0; !dayInk && j < Math.round(count / 12); j++) {
        lc.beginPath();
        lc.arc(Math.random() * W, Math.pow(Math.random(), 0.7) * H, 1.1, 0, Math.PI * 2);
        lc.fillStyle = "rgba(242,220,150,.55)";
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

    build();

    /* 主题切换时按新主题星色重建星层 */
    if (window.MutationObserver) {
      new MutationObserver(function () { build(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
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
  }

  window.QMFX = { trapFocus: trapFocus, cap: CAP, lite: FORCE_LITE, no3d: NO3D };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
