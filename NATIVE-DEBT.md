# 原生端欠账（网页版已修、原生待随下一期联合更新带上）

## 2026-11-09 · 跟唱提示音删除＋四钮等宽＋打分耳机提示 v597：提示音整段删除、四钮等宽等高、打分出耳机 toast（网页版已上线 v597，未打 APK）

- **网页版改动**：内部 v597 已上线（commit `d9c83515`）。用户 2026-11-09 11:19/11:20 定：提示音效果不好删掉；顶栏按钮大小统一；打开打分时出短暂提示。提示音整段删除：控制条提示音钮＋三态循环＋正弦振荡器 AudioContext 路径（toneOn/toneOnly/savedAudioVolume/TONE_GAIN/TONE_ONLY_GAIN/setToneMode/cycleTone 等）全部清除，www 四文件 grep `tone` 零命中；旋律音高线 strip（melody.json 可视化）保留。顶栏四钮等宽等高：播放／1×／单句循环／打分均为 flex:1 1 0＋46px＋.95rem＋padding:0 6px；360px 下每钮 78.5px，打分中…需 74.8px，单行放得下（余 3.7px）；320px 每钮 68.5px 不足，≤344px 改 2×2（flex:1 1 45%）等宽不变；旧 v596 打分钮 min-width:82px 已删。打分耳机提示：打分开始（麦克风授权成功）时出 toast「戴上耳机效果更好」（i18n karaoke_headphones_tip，简/繁），3s 自动消失，居中于歌词区、pointer-events:none 不挡控件不拦截点按，颜色走 CSS 变量链；每次打分开始都出，停止／关闭时提前隐藏。版本 bump v597：sw.js `wuri-v597-20261109-v597`，index.html 64× `?v=597`／0× `?v=596`，i18n.js me_ver 简/繁各 2× 内部 v597。测试 test_v596.js 85/85（样本＋真文件），test_v597.py 29/29，test_v596.py 29/29；v594_melody 107/0（真文件）；全套其余回归与 v596 基线一致（零新增失败；test_v597.py V1–V4 与 test_v596.py H1–H5/H7 为版号钉子，bump 后预期内失败）。
- **欠账范围**：CN 版、Play 版、iOS 版跟唱均未同步（提示音删除＋四钮等宽＋耳机 toast），下一期原生联合更新时一并带上；**本次不打 APK**。
- **原生侧修法**：原生分叉 `~/workspace/wuri-app/www` 同步 karaoke.js／style.css／index.html／i18n.js 的改动（index.html 的 ?v= 随版本 bump 走，不单独移植）；移植后抽验：提示音钮已消失、音高线仍在、四钮等宽等高、打分时「打分中…」四字完整、打分开始出耳机提示 3s 自消失。

## 2026-11-09 · 跟唱只听提示音＋打分中不截断 v596：提示音三态循环＋打分钮定宽（网页版已上线 v596，未打 APK）

- **网页版改动**：内部 v596 已上线（commit `0672f6ad`）。跟唱提示音钮三态循环（关→伴唱提示音→只听提示音→关）：只听态下原唱元素继续播放但 volume=0（时钟／逐字高亮／循环／跳转／快进退／切段全不受影响），提示音增益 0.35（伴唱态 0.2）；退出只听态恢复原唱音量，关视图／重开保留态；打分麦克风路径独立，只听态下打分仍可用。打分中不截断：打分钮按最长文案「打分中…」（4 字）定宽 min-width:82px（flex:0 0 auto），≤440px 控制条自然换行（flex-wrap）不挤压播放钮；文案变化时 layoutSticky() 重算吸顶 top。版本 bump v596：sw.js `wuri-v596-20261109-v596`，index.html 64× `?v=596`／0× `?v=595`，i18n.js me_ver 简/繁各 2× 内部 v596。测试 test_v596.js 85/85（样本＋真文件），test_v596.py 18/18；v594_melody 110/0（真文件）；全套其余回归与 v595 基线一致（零新增失败；test_v595.py H1–H5/H7 六处为 v595 版号钉子，属预期内）。
- **欠账范围**：CN 版、Play 版、iOS 版跟唱均未同步（提示音三态＋打分钮定宽），下一期原生联合更新时一并带上；**本次不打 APK**。
- **原生侧修法**：原生分叉 `~/workspace/wuri-app/www` 同步 karaoke.js／style.css／index.html 的三态与定宽改动（index.html 的 ?v= 随版本 bump 走，不单独移植）；移植后抽验：三态循环文案（提示音／只听提示音／关）、只听态原唱静音＋提示音独响、打分中四字完整显示、≤440px 控制条换行。

## 2026-11-09 · 跟唱逐字时间轴落表＋播放器布局微调 v595：char_t0 全量落地＋倍速/播放/音高区置顶（网页版已上线 v595，未打 APK）

- **网页版改动**：内部 v595 已上线（commits `7707e030`＋`e0d30dd7`）。逐字时间轴落表：`www/content/karaoke/timeline.json`（59,231 B，md5 `27af9e6570022319bd2f071fc0b06408`）147 行全量带 char_t0——用户点按实测 70 行（measured）＋hybrid 对齐 77 行（aligned）；idx 7 char_t0 [0.88, 3.58, 6.57, 9.41, 15.66, 18.81, 21.68] t1 22.18；idx 143（沉疴能自痊）[399.42, 399.61, 399.83, 400, 400.3] t1 402.0；t1 延展 35 行（末字超出行尾防截断），最大 +9.88s（idx 8：39.0 → 48.88）。melody.json 未动（md5 `5d4f52618df7a46f703eefd7eea5598d`）。播放器布局微调：倍速 pill 46→38px，播放钮 46→52px＋1.15rem＋white-space:nowrap（横排「播放」），音高区 position:sticky top:210px 置顶＋layoutSticky() melH 处理（`www/css/style.css`、`www/js/karaoke.js`）。版本 bump v595：sw.js `wuri-v595-20261109-v595`，index.html 64× `?v=595`／0× `?v=594`，i18n.js me_ver 简/繁各 2× 内部 v595。测试 test_v595.py 30/30；v594_melody 105/0（＋4 断言）；全套其余回归零新增失败。
- **欠账范围**：CN 版、Play 版、iOS 版跟唱均未同步（timeline.json char_t0＋播放器布局微调），下一期原生联合更新时一并带上；**本次不打 APK**。
- **原生侧修法**：原生分叉 `~/workspace/wuri-app/www` 同步 timeline.json 整文件＋karaoke.js／style.css 的布局改动（index.html 的 ?v= 随版本 bump 走，不单独移植）；移植后抽验：跟唱逐字变金与 char_t0 对齐（idx 7、idx 143 两处）、倍速 pill 38px、播放钮横排 52px、音高区滚动置顶。

## 2026-11-09 · 跟唱旋律引导 v594：音高线＋正弦提示音＋melody.json（网页版已上线 v594，未打 APK）

- **网页版改动**：内部 v594 已上线（commit `f1b413d2`）。跟唱新增旋律引导（用户 2026-11-09 定：音高线与提示音两个都要）：新数据 `www/content/karaoke/melody.json`（454,902 B，md5 `5d4f52618df7a46f703eefd7eea5598d`），三段青玄录音 pyin 提取（fmin 65/fmax 500 Hz＋0.25s 中位平滑，10 fps，8,402 帧；低于 100 Hz 的 fmin 底噪帧按无声处理，停顿进 breaks——两处 seg2 行内停顿 50.24–53.96s、104.81–108.61s 已为空白段）；播放器 `www/js/karaoke.js` 新增音高线 strip（控制条下方，30s 窗口前 8s＋后 22s＋播放头，110–310 Hz 对数轴，颜色走 CSS 变量链）与正弦提示音（独立 AudioContext＋OscillatorNode，增益 0.2，控制条「提示音」钮，默认关；停顿／暂停／关闭时静音，与打分麦克风 Analyser 路径分开）；`www/index.html` 控制条加「提示音」钮＋strip 结构；`www/css/style.css` 加旋律条样式（变量配色，日间／夜间／红光三态）。测试 `~/workspace/wuri-app/karaoke/tests/test_v594_melody.js` 101/101 通过；全套其余回归仅 test_v588 C2 一处因 karaoke.js 内容变更而失效（v588 旧 md5 钉子，属预期内）。提取与验证见 `~/workspace/wuri-app/karaoke/melody/MELODY-EXTRACTION-REPORT.md`。timeline.json／base_text.json 未动（点按标记落表另走 v595，不冲突）。
- **欠账范围**：CN 版、Play 版、iOS 版跟唱均未同步（melody.json＋播放器改动），下一期原生联合更新时一并带上；**本次不打 APK**。
- **原生侧修法**：原生分叉 `~/workspace/wuri-app/www` 同步 melody.json＋karaoke.js／index.html／style.css 的旋律引导改动（注意 app.js／qimen-app.js 不移植口径与此无关，本次改的三个文件均在移植范围内）；移植后抽验：跟唱页音高线随播放走、提示音钮默认关、开后跟旋律出声、停顿处静音。

## 2026-11-08 · KR5a0148 caption 订正 v593：71/72 左右互换（网页版已上线 v593，未打 APK）

- **网页版改动**：内部 v593 已上线（commit `2ab36a0c`）。KR5a0148《靈寶無量度人上品妙經符圖》71/72 caption 左右标反订正：71「天紀之圖（跨葉左）」→「天紀之圖（跨葉右）」，72「天紀之圖（跨葉右）・第一篇」→「天紀之圖（跨葉左）・第一篇」；仅改两处 caption 字符串，src/w/h/char/vol 不动，不增删条目；`www/content/daozang/images.json` md5 `1ed7f22559bd1f234fabf1987afd931b`。71/72/78 从今日 taolibrary 原版文件（c960067 img116/117/123）重裁校验：内容逐字一致，三图全部保留现生产文件，不替换、无尺寸/md5 变化（71 1200×1310 md5 `fd4a6966…`、72 1200×1342 `8fb1cd42…`、78 1200×1356 `12a42200…`）；71/72 统一纵向裁窗 [230,1574] 拼合验证成圆无 26px 台阶（仅验证用，不并入生产）。详见核查报告 `~/workspace/wuri-app/daozang-img-campaign/KR5a0148-INVESTIGATION.md` 与重裁比对 `~/workspace/wuri-app/daozang-img-campaign/.k148-scratch/V593-RECROP-COMPARISON.md`。
- **欠账范围**：CN 版、Play 版、iOS 版 images.json 两处 caption 均未同步，下一期原生联合更新时一并带上；图文件无变化，无需同步图片；**本次不打 APK**。
- **原生侧修法**：原生分叉 `~/workspace/wuri-app/www` 同步 images.json 仅两处 caption；移植后抽验 KR5a0148/71 显示「天紀之圖（跨葉右）」、72 显示「天紀之圖（跨葉左）・第一篇」。

## 2026-11-08 · KR5a0083 小字改名 v592：神符→文本（网页版已上线 v592，未打 APK）

- **网页版改动**：内部 v592 已上线（commit `10b85dab`）。KR5a0083《白羽黑翮靈飛玉符》原版核查无符图、纯文本，类签 神符 易误导读者期待符图，改为 文本：`www/content/daozang/index.json`（feed 版 64→65）、`texts/KR5a0083.json`、`texts-punct/KR5a0083.json` 三处 lei 神符→文本；其余 27 部神符類未动。显示：目录 pill 文本、文末小字「洞真部 · 文本类 · DZ0083」、搜索 snippet「道藏全集 · 洞真部 · 文本类 · 1 卷」。
- **欠账范围**：CN 版、Play 版、iOS 版 index.json / texts 均未同步，下一期原生联合更新时一并带上；**本次不打 APK**。
- **原生侧修法**：原生分叉 `~/workspace/wuri-app/www` 同步 index.json（feed 版 65）＋两处 KR5a0083.json 的 lei；移植后抽验该部文末小字与目录 pill。

## 2026-11-08 · 道藏图版重裁 v591：9 图尺寸变更（网页版已上线 v591，未打 APK）

- **网页版改动**：内部 v591 已上线（commit `4086e352`）。KR5c0019《太上飛步南斗太微玉經》8 图重裁＋KR5a0081 太帝招魂符跨叶重拼；`www/content/daozang/images.json` md5 `6c7f580b0ab3dfae723ca8e4c4f5da80`。新尺寸：KR5c0019/01 420×880、02 425×900、03 462×905、04 411×885、05 435×885、06 428×1010、07 416×780、08 405×790；KR5a0081/10 444×1370。详见 `~/workspace/wuri-app/daozang-img-campaign/V591-CLOSING-REPORT.md`。
- **欠账范围**：CN 版、Play 版、iOS 版图版与 images.json 均未同步，下一期原生联合更新时一并带上；**本次不打 APK**。
- **原生侧修法**：原生分叉 `~/workspace/wuri-app/www` 同步 9 张新图＋images.json（w/h 随上）；移植后抽验 KR5c0019/06（名栏＋小注全）与 KR5a0081/10（缝处横画接上）两处。

## 2026-11-08 · 道藏注音收尾 v590：54 枚新键＋2 枚改键（网页版已上线 v590，未打 APK）

- **网页版改动**：内部 v590 已上线（commit `4f24e6f8`）。道藏注音表
  `www/content/daozang/pinyin.json` 新增 overrides 54 枚、改 2 枚（dict 15,327
  不变，overrides 1,481→1,535；新表 md5 `b8153da72df0a9ac44ca1762425b6000`）。
  构成：度人經直音 miàn 定点键 10 枚（存晏眄／虚下眄／崑眄／眄若／夕眄／
  欣眄／始流眄／尾流眄／清晏眄／引眄，10 处）＋卒中 cù 26 枚新键（卒中惡／
  卒中蠱／卒中暴／卒中客忤／卒中邪／卒中五尸／卒中溪／卒中射／卒中沙／卒中諸／
  卒中冷／卒中瘑／卒中徧／卒中失／卒中忤／卒中賊／卒中鬼／卒中刺／卒中箭／
  卒中飛／卒中人／卒中蜚／卒中蟲／卒中急／卒中産／卒中金，96 处）＋卒中風
  [cù,zhòng,fēng]、中風卒暴 [zhōng,fēng,cù,bào] 2 枚改键＋譜內散字尺 chě
  18 枚键（尺工／尺六工／四一四尺／上尺上／一尺一尺／尺一四／一尺凢／六工一尺／
  一一尺／四一尺四／四六尺／六一尺／尺一一四／尺一尺工／工尺一尺／尺六工尺／
  尺工尺／一尺五六，53 处）。裁定与全量清单见
  `~/workspace/wuri-app/ruby-census/v590/V590-CLOSING-REPORT.md`、
  `v590/durenmian-proposed-keys.json`、`v590/zhongcu-proposed-keys.json`、
  `v590/chi-proposed-keys.json`。
- **欠账范围**：CN 版、Play 版、iOS 版道藏注音表均未同步（iOS 无道藏全集，
  按既有口径取舍），下一期原生联合更新时一并带上；**本次不打 APK**。
- **原生侧修法**：原生分叉 `~/workspace/wuri-app/www` 同步
  `content/daozang/pinyin.json` 整文件（或等价追加 54 枚 overrides＋改 2 枚，
  须保证 dict 15,327 不变、overrides 终态 1,535）；移植后抽验 卒中風（cù）、
  存晏眄（miàn）、尺六工尺（chě）三处注音。

## 2026-11-08 · 道藏注音收尾 v589：84 枚新键（网页版已上线 v589，未打 APK）

- **网页版改动**：内部 v589 已上线（commit `47420826`）。道藏注音表
  `www/content/daozang/pinyin.json` 新增 overrides 84 枚（dict 15,327 不变，
  overrides 1,397→1,481；新表 md5 `567b2c51762bc8f734e09ddb6ef0df5b`）。
  构成：湯湯窄键 12 枚（五福湯湯／水流湯湯／水湯湯／湯湯之水／黄河湯湯／
  沸沸湯湯／碧津之湯湯／汪汪焉湯湯／滉滉湯湯／四海湯湯／浩浩湯湯／水兮湯湯，
  湯→shāng，15 处）＋梵唄 [fàn,bài]（13 处）＋年少徵 [nián,shào,zhǐ]
  （1 处）＋姑射山 [gū,yè,shān]（31 处翻转）＋中風窄键 69 枚（前缀＋
  后缀两组，绝无整词「中風」键，中→zhòng，262 处翻转）。裁定与全量清单
  见 `~/workspace/wuri-app/ruby-census/v589/V589-CLOSING-REPORT.md`、
  `v589/small-items-proposed-keys.json`、`v589/zhongfeng-proposed-keys.json`。
- **欠账范围**：CN 版、Play 版、iOS 版道藏注音表均未同步（iOS 无道藏全集，
  按既有口径取舍），下一期原生联合更新时一并带上；**本次不打 APK**。
- **原生侧修法**：原生分叉 `~/workspace/wuri-app/www` 同步
  `content/daozang/pinyin.json` 整文件（或等价追加 84 枚 overrides，须保
  证 dict 15,327 不变、overrides 终态 1,481）；移植后抽验 姑射山（yè）、
  梵唄（bài）、卒中風（zhòng）三处注音。

## 2026-11-02 · 阅读器底栏：道藏/内丹删「背」换「我的标记」（用户 11:22 拍板）

- **网页版改动**：道藏、内丹两类书的阅读器底栏删掉「背」（背诵模式入口），
  换成「我的标记」（`#jing-marks-dock`，点开本书书签＋划线标记页，
  与目录首行/字面板本书组同一 fromReader 路径）；常见经文底栏维持
  目录｜读｜背｜字｜全展开｜注音原样，背诵代码本体不删。内丹/道藏若开书
  时全局背诵偏好开着，强制回落阅读模式渲染（偏好本身不动，回常见经文
  按偏好恢复）。底栏行在内丹/道藏态加 `dock-marks` 类走弹性配宽
  （四字钮 flex 1.62、单字钮 0.78），390px 核算标记钮 ≈91px、无截字。
  字面板本书组「我的标记」入口保留（双入口，最小改动）。
- **终版构成（2026-11-02 v542 续令，真机验收 v541 后用户亲定）**：标记钮
  自原位移至整排**最右端**——道藏/内丹底栏终版序为
  目录｜读｜字｜全展开/全收回｜注音开/关｜**我的标记**；配宽权重随钮
  迁移不变（标记钮仍为最宽格），v542 新序静态量测复核 390px 标记钮
  91.0px／需 58.4px、360px 83.5px，无截字。原生移植以下方终版构成为准，
  勿按 v541 的中间位版本移植。
- **网页版状态**：v541 已上线（删背换标记·原位版）；终版构成随内部
  **v542** 上线。
- **欠账范围**：CN 版、Play 版、iOS 版阅读器底栏同构未改，下一期原生
  联合更新时一并带上（iOS 无道藏全集，内丹部分同样适用）。
- **原生侧修法**：原生分叉 `~/workspace/wuri-app/www` 同步三处——
  index.html 底栏行**末尾**（`#jing-pybtn` 之后）加 `#jing-marks-dock` 钮
  （整排最右端）；js/jingwen.js `renderReaderBody` 按书类（isNeidan 或
  daozang）切换背/标记钮显隐＋`dock-marks` 类＋背诵态回落；css/style.css
  补 `#jing-dock-main.dock-marks` 六条配宽规则。移植后以 390px 宽度冒烟
  复核标记钮完整显示且居最右、三态（日/夜/红光）不变色错位。

## 2026-11-02 · 注音纠错批（内部 v540）：上白 bǐng／沉疴 chén kē／传承经音专项

- **网页版修复**：内部 v540 已上线。裁定与全量清单见
  `~/workspace/wuri-app/RUBY-FIX-1102.md`。要点：①「上白/啟白/奏白/再白」作禀告
  动词读 bǐng（功课经注音本传承经音，用户 2026-11-02 拍板）；②沉疴/沈痾读
  chén kē（《现代汉语词典》）；③玉枢咒链「唵吽吒唎萨嚩囉」读 ōng hōng zhā lì
  sà wā lā（用户提供的诵念传统）；④南無真 namo 位点读 nā mó、般若读 bō rě、
  沈（沉义）注 shěn 改 chén 等同类扫查。
- **数据面**：精选/内丹静态注音 28 个文件（www/jing＋www/content/jing 两套，
  含 pyPunct）；道藏 `content/daozang/pinyin.json`（dict 痾 ē→kē＋审读表
  442→525 条）；诵读音频 8 部整书 mp3＋时间戳重拼（s01 双声、s03 男、s16 男、
  s29 双声、s36 双声，共 12 段同音喂读重合成）；`js/offline-download.js`
  FALLBACK_SIZES 同步 8 个文件字节数。
- **欠账范围**：CN 版、Play 版、iOS 版的经文注音数据、道藏词表与上述音频
  全部未同步，下一期原生联合更新时一并带上（iOS 无道藏全集与占卜无关部分
  按既有口径取舍：经文注音与音频属非占卜内容，可同步）。
- **原生侧修法**：原生分叉 `~/workspace/wuri-app/www` 按网页版同批文件整覆：
  content/jing 与 jing 两套同名文件、content/daozang/pinyin.json、audio/jing
  与 audio/timestamps 的 8+8 个文件、offline-download.js 的 FALLBACK_SIZES
  8 个数值；移植后抽验 s29 咒链注音（ōng/wā/lā）与玉枢沈痾（chén/kē）两处。

## 2026-11-01 · 经文页每日经文推荐卡在搜索态压在搜索结果之上

- **现象**：经文页搜索时，每日经文推荐卡（#jingrec-card）出现在全部搜索结果上方；
  应恒在全部搜索结果最下方（默认态书架之下已对，见内部 v515）。
- **根因**：卡在 DOM 中位于 `#jing-list` 之后、`#jing-results` 之前；搜索态
  jingwen.js `search()` 隐藏 `#jing-list`、改显其后的 `#jing-results`，
  卡遂居结果之上。
- **网页版修复**：内部 v525 已上线——卡片 DOM 移至 `#jing-results` 之后
  （仍在 `#jing-home` 内、`#jing-marks` 之前），默认/搜索/0 结果三态几何实测通过。
- **升级·全域不变量（2026-11-02 v542，用户真机验收后亲令「在任何页面，
  它都应该是最下面的」）**：v525 后仍有一态漏网——`#jing-marks`（我的标记
  页）独居卡之后，从阅读器进标记页时卡压在标记内容（返回目录钮＋页签＋
  列表）之上。v542 一次治本：`#jing-marks` 移至卡之前，**`#jingrec-card`
  成为 `#jing-home` 的最后一个子元素**；默认书架／搜索有结果／搜索零
  结果／搜索清空／我的标记／阅读统计／生词本全部状态下卡恒居经文页
  最底部，index.html 卡前注释已立此不变量（新增状态容器必须插到卡之前）。
- **欠账范围**：CN 版 APK 与 Play 版同病，本次**有意不单独修**（用户 2026-11-01
  14:22 亲定：攒着，等下一期原生联合更新时一并带上）。
- **原生侧修法**：原生分叉 `~/workspace/wuri-app/www/index.html` 同步同一
  DOM 秩序：`#jingrec-card` 置于 `#jing-results` **与 `#jing-marks` 两者
  之后**、作 `#jing-home` 末位子元素（v525 的「移至 #jing-results 之后」
  尚不充分，必须同时越过 #jing-marks）；打包前冒烟复核覆盖搜索「道法
  会元」（卡底于最后一条结果之下）＋标记态（卡底于标记列表之下）两态。

## 2026-11-01 · 「我的」页高级版权益文案误列「内丹经十五部」

- **现象**：高级版卡片权益清单以「内丹经十五部、道藏全集、星象全模块、……」
  起头；十五部内丹经全部收在道藏全集里，并列单列是错的（用户 2026-11-01
  23:47 真机指正）。
- **网页版修复**：内部 v533 已上线——`pro_card_hint`（www/js/i18n.js 简/繁
  两处）与 www/index.html 兜底文案删除「内丹经十五部、」/「內丹經十五部、」，
  清单改以「道藏全集」起头，其余不变。
- **欠账范围**：CN 版、Play 版、iOS 版「我的」页高级版卡片同串未改，下一期
  原生联合更新时一并带上；iOS「我的」页同串也要同步删。
- **原生侧修法**：各端分叉源码内 grep「内丹经十五部、道藏全集」及繁体
  「內丹經十五部、道藏全集」，逐处按网页版同法只删该项。
- **续（2026-11-02 06:16 用户裁定，推翻原注脚）**：付费墙条目 pay_f1
  「内丹经十五部全文：《黄庭内景经》……」**整条删除**——用户亲自裁定与
  pro_card_hint 同一逻辑（十五部全在道藏全集里，pay_f8「道藏全集全文
  通读」保留）。网页版已于内部 v537 删除（i18n 简/繁键＋index.html
  `<li data-i18n="pay_f1">` 整条）。原生下一期须连同 pay_f1 一并删：
  各端分叉源码内删除 pay_f1 的 i18n 键（简/繁）与付费墙 `<li>` 整条；
  此前「原生勿擅自连带删除」的注脚作废。

## 更新流渠道分流（2026-11-02 晚，用户真机反馈＋亲裁分流）

- **事故**：CN 暂存包内 `cn-update.js` 的 `CURRENT_CODE` 常量人工同步漏更、
  停在 34 而 feed 已 37，导致全体 CN 用户（含最新 3.0.1/code 37 本人）被
  「发现新版 v3.0.1」同版误报；模块零渠道守卫、文案为 CN/下载站口径。
  详见 `~/workspace/wuri-app/UPDATE-CHANNEL-FIX-1102.md`。
- **网页侧（已上 v559）**：新增 `js/store-update.js`（iOS 查 App Store
  Lookup、Play 查 feed 的 play 块、原生标记缺失即静默、网页环境退出），
  提示卡改底部 sheet（贴底栏上方＋遮罩，变量配色三态）。Play feed 块已
  上线（version.json 加 play 字段，CN 字段未动）。
- **CN 下期构建必带**：`prepare_cn_www.py` 模板已换代（渠道守卫＋
  code×版号双保险比较＋底部 sheet＋包内真实进度条：半透明/可拖动/✕，
  回调链与 jingwen.js 按文件名分发）＋CURRENT_CODE/NAME 改构建期自
  AndroidManifest-cn.xml 自动注入硬校验；JsBridge 已备料 cancelDownload
  （断连真取消）与 installApk（FileProvider＋files-path＋CN 清单
  REQUEST_INSTALL_PACKAGES）——构建时须冒烟：同版不弹、进度真实、
  ✕ 真停、完成可安装。
- **Play 下期构建必带**：`prepare_play_www.py` 已备料注入
  `js/wuri-channel.js`（WURI_CHANNEL='play'＋清单 versionName）＋
  store-update.js 拷贝与脚本标签；冒烟：Play 弹卡只跳 Google Play 页。
- **iOS 下期构建必带**：按 UPDATE-CHANNEL-FIX-1102.md 第四节接线
  （store-update.js＋wuri-channel.js 注入 'ios'＋MARKETING_VERSION），
  并加构建期断言：iOS www 内 grep `cn-update` 与 `apk/version.json`
  必须 0 命中。现提审 build 18 经逐包核验无任何更新模块，无此问题。
