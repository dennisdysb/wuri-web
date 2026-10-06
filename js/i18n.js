/* 戊日不上香 · 国际化（简体 / 繁体）
* 固定文案：手写核对的繁体表（I18N），不依赖机器转换。
* 历法库动态输出（农历月日名、节气名、宜忌、生肖）：用 S2T 逐字映射，
* 映射表仅收录本应用历法文本会出现、且简繁一对一无歧义的字。 */
(function () {
'use strict';

var I18N = {
'zh-CN': {
app_title: '戊日不上香',
tab_home: '首页', tab_cal: '黄历', tab_jing: '经文', tab_remind: '提醒', tab_me: '我的',
pro_title: '高级版', pro_locked: '未解锁', pro_active: '已激活 ✓',
pro_unlock: '解锁高级版', pro_restore: '恢复购买', pro_buy: '立即解锁',
pro_card_hint: '经文库、桌面小组件、年历总览、修行日程、八字排盘，一次买断，永久使用。',
pro_pay_sub: '一次买断，永久使用',
pro_feat_jing: '经文库：道藏精选、拼音注音、诵读、全文检索',
pro_feat_widget: '桌面小组件：每日干支与戊日一目了然',
pro_feat_year: '全年总览：一页纵览全年戊日，导出分享',
pro_feat_practice: '修行日程：诵经打坐排期，自动校验戊日',
pro_feat_bazi: '八字排盘：出生时间一键起盘',
pro_pay_note: '通过 Google Play 安全支付。更换设备或重装后，可用「恢复购买」找回高级版。',
pro_buy_cancelled: '已取消购买', pro_buy_error: '购买失败', pro_no_billing: '当前环境不支持内购',
pro_restoring: '正在恢复购买…', pro_test_unlocked: '测试模式：Pro 已解锁',
jing_lock_hint: '经文库为高级版功能，解锁后可读诵、检索道藏精选经文。',
yv_year_view: '年览', yv_back: '月历', yv_export: '导出图片', yv_print: '打印',
jing_search_ph: '搜索经文…', jing_back: '‹ 目录', jing_speak: '诵读', jing_stop: '停止', jing_recite: '背诵', jing_recite_on: '退出背诵',
practice_title: '修行日程', practice_hint: '诵经打坐排期，自动校验戊日；记录每日修行。',
practice_enter: '进入修行日程', practice_back: '‹ 返回',
practice_tab_schedule: '日程', practice_tab_journal: '日记',
practice_add: '＋ 添加日程', practice_type: '类型',
practice_type_songjing: '诵经', practice_type_dazuo: '打坐', practice_type_baidou: '拜斗',
practice_type_zhaijiao: '斋醮', practice_type_other: '其他',
practice_title_label: '事项', practice_title_ph: '如：早课诵经（可选，默认用类型名）',
practice_date: '日期', practice_time: '时间', practice_note: '备注', practice_note_ph: '可选',
practice_save: '保存', practice_cancel: '取消', practice_delete: '删除',
practice_done: '完成', practice_undone: '重做',
practice_wu_ming: '明戊日', practice_wu_an: '暗戊日', practice_wu_none: '非戊日',
practice_wu_warn: '此日为戊日，不宜上香，请斟酌安排。',
practice_empty_schedule: '暂无日程，点击下方按钮添加。',
practice_empty_journal: '暂无日记，记录今日修行吧。',
practice_journal_add: '＋ 写日记', practice_journal_content: '内容',
practice_journal_ph: '今日修行记录…', practice_journal_auto: '戊日的日记会自动标记「戊日修行」。',
practice_jour_wu: '戊日修行',
practice_need_date: '请选择日期', practice_need_content: '请填写日记内容',
practice_confirm_del: '确定删除吗？',
bazi_title: '八字排盘', bazi_hint: '输入出生时间，一键起四柱八字、大运。',
bazi_enter: '开始排盘', bazi_back: '‹ 返回',
bazi_input: '出生信息', bazi_birth_date: '出生日期', bazi_birth_time: '出生时间',
bazi_time_hint: '时间不详可留空，则只排三柱（年/月/日）。',
bazi_gender: '性别', bazi_male: '男', bazi_female: '女',
bazi_gender_hint: '性别影响大运顺逆。',
bazi_go: '起盘', bazi_need_date: '请选择出生日期', bazi_bad_date: '日期无效',
bazi_year: '年柱', bazi_month: '月柱', bazi_day: '日柱', bazi_time: '时柱',
bazi_wuxing: '五行', bazi_dayun: '大运', bazi_qiyun: '起运', bazi_sui: '岁',
bazi_forward: '顺行', bazi_backward: '逆行',
bazi_name: '姓名', bazi_name_ph: '可选', bazi_calendar: '历法', bazi_solar: '公历', bazi_lunar: '农历',
bazi_true_solar: '真太阳时换算', bazi_birthplace: '出生地区', bazi_longitude: '经度',
bazi_group: '分组', bazi_group_ph: '如：家人（可选）', bazi_save_hist: '保存到历史记录',
bazi_history: '历史记录',
bazi_disclaimer: '以上为传统历法推算，仅供参考，不作命理解读。',
practice_remind: '到时提醒', practice_remind_hint: '勾选后将在日程时间到达时发送通知提醒。',
practice_jour_private: '日记仅保存在本机，不上传。',
cal_title: '道历黄历',
nav_prev: '上个月', nav_next: '下个月',
legend_ming: '明戊日', legend_an: '暗戊日', legend_baidou: '拜斗日', legend_shendan: '神诞日', legend_today: '今天',
d_lunar: '农历', d_gz: '干支', d_jieqi: '节气', d_chongsha: '冲煞',
d_zhishen: '值神',
sizhi_title: '四值功曹',
gc_year: '值年功曹', gc_month: '值月功曹', gc_day: '值日功曹', gc_hour: '值时功曹',
dj_go: '确定', dj_today: '回到今天', dj_cancel: '取消', dj_hint: '点击选择任意日期',
u_year: '年', u_month: '月', u_day: '日',
yi: '宜', ji: '忌',
home_yiji: '今日宜忌', home_month_wu: '本月戊日', home_bazi: '此刻干支',
pillar_year: '年柱', pillar_month: '月柱', pillar_day: '日柱', pillar_time: '时柱',
count_label: '距离下个明戊日还有', count_unit: '天',
theme_toggle: '切换主题',
remind_title: '上香提醒',
remind_wu: '明戊日提醒', remind_wu_sub: '戊日不朝真，提前提醒您不上香',
remind_anwu: '暗戊日提醒', remind_anwu_sub: '各派做法不一，仅作提示',
kind_today: '当天', kind_day1: '提前1天', kind_custom: '自选',
offset_label: '提前',
unit_min: '分钟', unit_hour: '小时', unit_day: '天', unit_week: '周',
remind_time: '提醒时间',
remind_baidou: '拜斗日提醒', remind_baidou_sub: '朔望礼斗、九皇斋期，宜斋戒敬香',
adv_note: '进阶提醒时间与戊日提醒相同。',
    remind_timing: '提醒时机',
    kind_day1: '提前1天', kind_today: '当天', kind_custom: '自选',
    offset_label: '提前', unit_min: '分钟', unit_hour: '小时', unit_day: '天', unit_week: '周',
perm_title: '权限状态', perm_notif: '通知权限', perm_alarm: '精确闹钟',
perm_checking: '检测中…', perm_unknown: '未知', perm_prompt: '待询问',
perm_device_only: '仅真机可用', perm_allowed: '已允许 ✓', perm_denied: '未允许',
btn_perm: '申请通知权限', btn_alarm: '去开启精确闹钟',
perm_hint: '如果提醒不准时，请到手机「设置 → 应用 → 戊日不上香」中允许「通知」与「闹钟和提醒」。应用被省电策略清理后台也可能影响提醒，可将本应用设为「不受电池优化限制」。',
adv_section: '进阶提醒（道教斋醮日）',
adv_gengshen: '庚申日', adv_gengshen_sub: '庚申日守庚申',
adv_jiazi: '甲子日', adv_jiazi_sub: '甲子日斋醮',
adv_cysw: '初一 · 十五', adv_cysw_sub: '月朔月望，宜斋戒',
adv_bajie: '八节', adv_bajie_sub: '立春、春分、立夏、夏至、立秋、秋分、立冬、冬至',
adv_sanyuan: '三元', adv_sanyuan_sub: '正月十五上元、七月十五中元、十月十五下元',
adv_wula: '五腊日', adv_wula_sub: '正月初一、五月初五、七月初七、十月初一、十二月初八',
    adv_shendan: '神诞日', adv_shendan_sub: '诸神圣诞，宜斋戒敬香',
test_title: '测试提醒', test_btn: '发送测试提醒',
test_hint1: '测试用，不影响正式提醒排期。点击后约 15 秒内发出一条测试通知，用于验证通知权限与提醒通道是否正常。',
test_not_native: '测试通知仅在真机 App 内可用。',
test_prefix: '', test_suffix: '（测试通知，不影响正式排期）',
test_ok_title: '提醒通道正常',
test_ok_body: '这是一条测试通知，说明通知权限与提醒通道工作正常。',
test_sent: '测试通知已发送排期，将在约 15 秒内到达（本次共排期 %d 条，含正式提醒）。',
test_fail: '发送失败，请先确认通知权限已允许。',
me_tz: '排盘时区', tz_auto: '跟随手机时区', tz_beijing: '北京时间（东八区）',
tz_hint: '身在海外时，若按国内老黄历对照请选择「北京时间」。',
me_theme: '外观主题', theme_auto: '跟随系统', theme_day: '白天 · 宣纸', theme_night: '黑夜 · 玄黑',
me_lang: '语言', lang_auto: '跟随系统', lang_cn: '简体中文', lang_tw: '繁體中文',
me_about: '关于', me_app: '应用', me_ver: '戊日不上香 v1.3.0',
me_about_hint: '戊日不朝真。本应用按日柱天干推算戊日并提前提醒，农历、干支、节气、宜忌均由内置历法库离线计算。本应用采用地支藏干法推算暗戊日（日支藏戊：寅、辰、巳、申、戌）；暗戊规则并无跨门派统一标准，请遵师承。',
privacy: '隐私政策',
privacy_effective: '生效日期：2026年9月28日',
priv_p1: '本应用不收集、不存储、不上传、不分享您的任何个人信息。所有农历、干支、节气计算均在您的手机本地离线完成；提醒通知由手机系统本地调度，不经过任何服务器。',
priv_p2: '本应用仅申请以下系统权限，且仅用于提醒功能：',
priv_perm1: '通知权限：用于在戊日及斋醮日发出本地提醒；',
priv_perm2: '精确闹钟权限：用于准时触发提醒。',
priv_p3: '本应用不包含广告，不包含第三方数据分析工具。如有疑问，请联系开发者。',
status_ming_title: '今日戊日 · 不上香',
status_ming_sub: '戊日不朝真，今日请勿烧香拜神',
status_ok_title: '今日可祈福上香',
status_ok_sub: '今日%s日，非戊日',
status_an_title: '今日暗戊日',
status_an_sub: '各派做法不一，请遵师承',
anwu_what: '什么是暗戊日？',
anwu_explain: '暗戊日按地支藏干推算：日支所藏天干见「戊」之日（寅、辰、巳、申、戌）。关于暗戊日是否上香，各门派做法不一：有的门派亦不上香，有的照常上香。居士可自便，门内弟子请遵师承。',
anwu_why: '%s中藏戊，故为暗戊。',
anwu_rule_short: '是否上香各门派做法不一：有的门派亦不上香，有的照常上香。普通居士不必一刀切，门内弟子请遵师承。（本应用按六戊日提醒不上香；具体规制请依师承。）',
baidou_note_shuowang: '朔望礼斗：农历初一、十五，民间有礼拜北斗之俗，宜斋戒敬香。',
baidou_note_jiuhuang: '九皇斋期：农历九月初一至初九，礼拜九皇大帝与斗姥元君（初九圣诞），宜斋戒敬香。',
tag_ming: '明戊日', tag_an: '暗戊日', tag_baidou: '拜斗日', tag_chuyi: '初一', tag_shiwu: '十五', tag_shendan: '神诞日',
    taisui_line: '%s年 · 值年太岁%s大将军', notif_shendan_body: '%s是%s，宜斋戒敬香。', perm_na: 'iOS 无需设置', perm_hint_ios: '提醒由系统本地通知发出：请在「设置 → 戊日不上香 → 通知」中允许通知。',
next_an_prefix: '下个暗戊日',
rel_tomorrow: '明天', rel_dayafter: '后天',
month_ming: '本月 <b>%d</b> 个明戊日：',
month_an: '本月 <b>%d</b> 个暗戊日：',
month_none: '本月无戊日',
detail_ming: '☛ 本日为戊日，不上香',
detail_ok: '非戊日，可正常上香',
detail_an: '◐ 本日为暗戊日',
jieqi_now: '当前节气：', jieqi_today: '今日交节气：',
sched_done: '已排期共 %d 条提醒',
sched_none: '暂无排期（请检查开关与权限）',
notif_wu_title: '戊日不上香',
notif_wu_body: '%s是戊%s日，戊日不朝真，请勿烧香拜神。',
notif_an_title: '暗戊日提示',
notif_an_body: '%s是暗戊日（%s日）。是否上香各门派做法不一，请遵师承。',
notif_bd_title: '拜斗日提醒',
notif_bd_body: '%s是拜斗日（%s），宜斋戒敬香。',
bd_extra_99: '九月初九·斗姥元君圣诞，九皇斋期',
bd_extra_9: '九皇斋期内，礼斗祈福',
bd_extra_1: '朔日礼斗',
bd_extra_15: '望日礼斗',
notif_cysw_body: '%s是%s，月朔月望，宜斋戒敬香。',
notif_adv_body: '%s是%s%s，宜斋戒敬香。',
adv_label_bajie: '八节', adv_label_wula: '五腊日',
sanyuan_shang: '上元节', sanyuan_zhong: '中元节', sanyuan_xia: '下元节',
when_today: '今日', when_tomorrow: '明日', when_dur: '%s后（%s）', when_ndays: '提前%d天（%s）',
dur_week: '%d周', dur_day: '%d天', dur_hour: '%d小时', dur_min: '%d分钟',
alert_alarm: '请手动前往：手机设置 → 应用 → 戊日不上香 → 闹钟和提醒，允许设置闹钟。'
},
'zh-TW': {
app_title: '戊日不上香',
tab_home: '首頁', tab_cal: '黃曆', tab_jing: '經文', tab_remind: '提醒', tab_me: '我的',
pro_title: '高級版', pro_locked: '未解鎖', pro_active: '已激活 ✓',
pro_unlock: '解鎖高級版', pro_restore: '恢復購買', pro_buy: '立即解鎖',
pro_card_hint: '經文庫、桌面小組件、年曆總覽、修行日程、八字排盤，一次買斷，永久使用。',
pro_pay_sub: '一次買斷，永久使用',
pro_feat_jing: '經文庫：道藏精選、拼音注音、誦讀、全文檢索',
pro_feat_widget: '桌面小組件：每日干支與戊日一目了然',
pro_feat_year: '全年總覽：一頁縱覽全年戊日，導出分享',
pro_feat_practice: '修行日程：誦經打坐排期，自動校驗戊日',
pro_feat_bazi: '八字排盤：出生時間一鍵起盤',
pro_pay_note: '通過 Google Play 安全支付。更換設備或重裝後，可用「恢復購買」找回高級版。',
pro_buy_cancelled: '已取消購買', pro_buy_error: '購買失敗', pro_no_billing: '當前環境不支持內購',
pro_restoring: '正在恢復購買…', pro_test_unlocked: '測試模式：Pro 已解鎖',
jing_lock_hint: '經文庫為高級版功能，解鎖後可讀誦、檢索道藏精選經文。',
yv_year_view: '年覽', yv_back: '月曆', yv_export: '導出圖片', yv_print: '打印',
jing_search_ph: '搜索經文…', jing_back: '‹ 目錄', jing_speak: '誦讀', jing_stop: '停止', jing_recite: '背誦', jing_recite_on: '退出背誦',
practice_title: '修行日程', practice_hint: '誦經打坐排期，自動校驗戊日；記錄每日修行。',
practice_enter: '進入修行日程', practice_back: '‹ 返回',
practice_tab_schedule: '日程', practice_tab_journal: '日記',
practice_add: '＋ 添加日程', practice_type: '類型',
practice_type_songjing: '誦經', practice_type_dazuo: '打坐', practice_type_baidou: '拜斗',
practice_type_zhaijiao: '齋醮', practice_type_other: '其他',
practice_title_label: '事項', practice_title_ph: '如：早課誦經（可選，默認用類型名）',
practice_date: '日期', practice_time: '時間', practice_note: '備註', practice_note_ph: '可選',
practice_save: '保存', practice_cancel: '取消', practice_delete: '刪除',
practice_done: '完成', practice_undone: '重做',
practice_wu_ming: '明戊日', practice_wu_an: '暗戊日', practice_wu_none: '非戊日',
practice_wu_warn: '此日為戊日，不宜上香，請斟酌安排。',
practice_empty_schedule: '暫無日程，點擊下方按鈕添加。',
practice_empty_journal: '暫無日記，記錄今日修行吧。',
practice_journal_add: '＋ 寫日記', practice_journal_content: '內容',
practice_journal_ph: '今日修行記錄…', practice_journal_auto: '戊日的日記會自動標記「戊日修行」。',
practice_jour_wu: '戊日修行',
practice_need_date: '請選擇日期', practice_need_content: '請填寫日記內容',
practice_confirm_del: '確定刪除嗎？',
bazi_title: '八字排盤', bazi_hint: '輸入出生時間，一鍵起四柱八字、大運。',
bazi_enter: '開始排盤', bazi_back: '‹ 返回',
bazi_input: '出生信息', bazi_birth_date: '出生日期', bazi_birth_time: '出生時間',
bazi_time_hint: '時間不詳可留空，則只排三柱（年/月/日）。',
bazi_gender: '性別', bazi_male: '男', bazi_female: '女',
bazi_gender_hint: '性別影響大運順逆。',
bazi_go: '起盤', bazi_need_date: '請選擇出生日期', bazi_bad_date: '日期無效',
bazi_year: '年柱', bazi_month: '月柱', bazi_day: '日柱', bazi_time: '時柱',
bazi_wuxing: '五行', bazi_dayun: '大運', bazi_qiyun: '起運', bazi_sui: '歲',
bazi_forward: '順行', bazi_backward: '逆行',
bazi_name: '姓名', bazi_name_ph: '可選', bazi_calendar: '曆法', bazi_solar: '公曆', bazi_lunar: '農曆',
bazi_true_solar: '真太陽時換算', bazi_birthplace: '出生地區', bazi_longitude: '經度',
bazi_group: '分組', bazi_group_ph: '如：家人（可選）', bazi_save_hist: '保存到歷史記錄',
bazi_history: '歷史記錄',
bazi_disclaimer: '以上為傳統曆法推算，僅供參考，不作命理解讀。',
practice_remind: '到時提醒', practice_remind_hint: '勾選後將在日程時間到達時發送通知提醒。',
practice_jour_private: '日記僅保存在本機，不上傳。',
cal_title: '道曆黃曆',
nav_prev: '上個月', nav_next: '下個月',
legend_ming: '明戊日', legend_an: '暗戊日', legend_baidou: '拜斗日', legend_shendan: '神誕日', legend_today: '今天',
d_lunar: '農曆', d_gz: '干支', d_jieqi: '節氣', d_chongsha: '衝煞',
d_zhishen: '值神',
sizhi_title: '四值功曹',
gc_year: '值年功曹', gc_month: '值月功曹', gc_day: '值日功曹', gc_hour: '值時功曹',
dj_go: '確定', dj_today: '回到今天', dj_cancel: '取消', dj_hint: '點擊選擇任意日期',
u_year: '年', u_month: '月', u_day: '日',
yi: '宜', ji: '忌',
home_yiji: '今日宜忌', home_month_wu: '本月戊日', home_bazi: '此刻干支',
pillar_year: '年柱', pillar_month: '月柱', pillar_day: '日柱', pillar_time: '時柱',
count_label: '距離下個明戊日還有', count_unit: '天',
theme_toggle: '切換主題',
remind_title: '上香提醒',
remind_wu: '明戊日提醒', remind_wu_sub: '戊日不朝真，提前提醒您不上香',
remind_anwu: '暗戊日提醒', remind_anwu_sub: '各派做法不一，僅作提示（與戊日提醒同一時間）',
kind_today: '當天', kind_day1: '提前1天', kind_custom: '自選',
offset_label: '提前',
unit_min: '分鐘', unit_hour: '小時', unit_day: '天', unit_week: '週',
remind_time: '提醒時間',
remind_baidou: '拜斗日提醒', remind_baidou_sub: '朔望禮斗、九皇齋期，宜齋戒敬香',
adv_note: '進階提醒時間與戊日提醒相同。',
    remind_timing: '提醒時機',
    kind_day1: '提前1天', kind_today: '當天', kind_custom: '自選',
    offset_label: '提前', unit_min: '分鐘', unit_hour: '小時', unit_day: '天', unit_week: '週',
perm_title: '權限狀態', perm_notif: '通知權限', perm_alarm: '精確鬧鐘',
perm_checking: '檢測中…', perm_unknown: '未知', perm_prompt: '待詢問',
perm_device_only: '僅真機可用', perm_allowed: '已允許 ✓', perm_denied: '未允許',
btn_perm: '申請通知權限', btn_alarm: '去開啟精確鬧鐘',
perm_hint: '如果提醒不準時，請到手機「設定 → 應用 → 戊日不上香」中允許「通知」與「鬧鐘和提醒」。應用被省電策略清理後台也可能影響提醒，可將本應用設為「不受電池優化限制」。',
adv_section: '進階提醒（道教齋醮日）',
adv_gengshen: '庚申日', adv_gengshen_sub: '庚申日守庚申',
adv_jiazi: '甲子日', adv_jiazi_sub: '甲子日齋醮',
adv_cysw: '初一 · 十五', adv_cysw_sub: '月朔月望，宜齋戒',
adv_bajie: '八節', adv_bajie_sub: '立春、春分、立夏、夏至、立秋、秋分、立冬、冬至',
adv_sanyuan: '三元', adv_sanyuan_sub: '正月十五上元、七月十五中元、十月十五下元',
adv_wula: '五臘日', adv_wula_sub: '正月初一、五月初五、七月初七、十月初一、十二月初八',
    adv_shendan: '神誕日', adv_shendan_sub: '諸神聖誕，宜齋戒敬香',
test_title: '測試提醒', test_btn: '發送測試提醒',
test_hint1: '測試用，不影響正式提醒排期。點擊後約 15 秒內發出一條測試通知，用於驗證通知權限與提醒通道是否正常。',
test_not_native: '測試通知僅在真機 App 內可用。',
test_prefix: '', test_suffix: '（測試通知，不影響正式排期）',
test_ok_title: '提醒通道正常',
test_ok_body: '這是一條測試通知，說明通知權限與提醒通道工作正常。',
test_sent: '測試通知已發送排期，將在約 15 秒內到達（本次共排期 %d 條，含正式提醒）。',
test_fail: '發送失敗，請先確認通知權限已允許。',
me_tz: '排盤時區', tz_auto: '跟隨手機時區', tz_beijing: '北京時間（東八區）',
tz_hint: '身在海外時，若按國內老黃曆對照請選擇「北京時間」。',
me_theme: '外觀主題', theme_auto: '跟隨系統', theme_day: '白天 · 宣紙', theme_night: '黑夜 · 玄黑',
me_lang: '語言', lang_auto: '跟隨系統', lang_cn: '簡體中文', lang_tw: '繁體中文',
me_about: '關於', me_app: '應用', me_ver: '戊日不上香 v1.3.0',
me_about_hint: '戊日不朝真。本應用按日柱天干推算戊日並提前提醒，農曆、干支、節氣、宜忌均由內置曆法庫離線計算。本應用採用地支藏干法推算暗戊日（日支藏戊：寅、辰、巳、申、戌）；暗戊規則並無跨門派統一標準，請遵師承。',
privacy: '隱私政策',
privacy_effective: '生效日期：2026年9月28日',
priv_p1: '本應用不收集、不存儲、不上傳、不分享您的任何個人信息。所有農曆、干支、節氣計算均在您的手機本地離線完成；提醒通知由手機系統本地調度，不經過任何服務器。',
priv_p2: '本應用僅申請以下系統權限，且僅用於提醒功能：',
priv_perm1: '通知權限：用於在戊日及齋醮日發出本地提醒；',
priv_perm2: '精確鬧鐘權限：用於準時觸發提醒。',
priv_p3: '本應用不包含廣告，不包含第三方數據分析工具。如有疑問，請聯繫開發者。',
status_ming_title: '今日戊日 · 不上香',
status_ming_sub: '戊日不朝真，今日請勿燒香拜神',
status_ok_title: '今日可祈福上香',
status_ok_sub: '今日%s日，非戊日',
status_an_title: '今日暗戊日',
status_an_sub: '各派做法不一，請遵師承',
anwu_what: '什麼是暗戊日？',
anwu_explain: '暗戊日按地支藏干推算：日支所藏天干見「戊」之日（寅、辰、巳、申、戌）。關於暗戊日是否上香，各門派做法不一：有的門派亦不上香，有的照常上香。居士可自便，門內弟子請遵師承。',
anwu_why: '%s中藏戊，故為暗戊。',
anwu_rule_short: '是否上香各門派做法不一：有的門派亦不上香，有的照常上香。普通居士不必一刀切，門內弟子請遵師承。（本應用按六戊日提醒不上香；具體規制請依師承。）',
baidou_note_shuowang: '朔望禮斗：農曆初一、十五，民間有禮拜北斗之俗，宜齋戒敬香。',
baidou_note_jiuhuang: '九皇齋期：農曆九月初一至初九，禮拜九皇大帝與斗姥元君（初九聖誕），宜齋戒敬香。',
tag_ming: '明戊日', tag_an: '暗戊日', tag_baidou: '拜斗日', tag_chuyi: '初一', tag_shiwu: '十五', tag_shendan: '神誕日',
    taisui_line: '%s年 · 值年太歲%s大將軍', notif_shendan_body: '%s是%s，宜齋戒敬香。', perm_na: 'iOS 無需設定', perm_hint_ios: '提醒由系統本地通知發出：請在「設定 → 戊日不上香 → 通知」中允許通知。', tag_shendan: '神诞日',
next_an_prefix: '下個暗戊日',
rel_tomorrow: '明天', rel_dayafter: '後天',
month_ming: '本月 <b>%d</b> 個明戊日：',
month_an: '本月 <b>%d</b> 個暗戊日：',
month_none: '本月無戊日',
detail_ming: '☛ 本日為戊日，不上香',
detail_ok: '非戊日，可正常上香',
detail_an: '◐ 本日為暗戊日',
jieqi_now: '當前節氣：', jieqi_today: '今日交節氣：',
sched_done: '已排期共 %d 條提醒',
sched_none: '暫無排期（請檢查開關與權限）',
notif_wu_title: '戊日不上香',
notif_wu_body: '%s是戊%s日，戊日不朝真，請勿燒香拜神。',
notif_an_title: '暗戊日提示',
notif_an_body: '%s是暗戊日（%s日）。是否上香各門派做法不一，請遵師承。',
notif_bd_title: '拜斗日提醒',
notif_bd_body: '%s是拜斗日（%s），宜齋戒敬香。',
bd_extra_99: '九月初九·斗姥元君聖誕，九皇齋期',
bd_extra_9: '九皇齋期內，禮斗祈福',
bd_extra_1: '朔日禮斗',
bd_extra_15: '望日禮斗',
notif_cysw_body: '%s是%s，月朔月望，宜齋戒敬香。',
notif_adv_body: '%s是%s%s，宜齋戒敬香。',
adv_label_bajie: '八節', adv_label_wula: '五臘日',
sanyuan_shang: '上元節', sanyuan_zhong: '中元節', sanyuan_xia: '下元節',
when_today: '今日', when_tomorrow: '明日', when_dur: '%s後（%s）', when_ndays: '提前%d天（%s）',
dur_week: '%d週', dur_day: '%d天', dur_hour: '%d小時', dur_min: '%d分鐘',
alert_alarm: '請手動前往：手機設定 → 應用 → 戊日不上香 → 鬧鐘和提醒，允許設定鬧鐘。'
}};

/* 简→繁逐字映射：仅收录历法文本中出现且无歧义的字 */
var S2T = {
'腊': '臘', '闰': '閏',
'惊': '驚', '蛰': '蟄', '谷': '穀', '满': '滿', '种': '種', '处': '處',
'斋': '齋', '醮': '醮', '头': '頭', '猎': '獵', '渔': '漁', '绘': '繪',
'开': '開', '竖': '豎', '纳': '納', '问': '問', '归': '歸', '帐': '帳',
'订': '訂', '进': '進', '亲': '親', '临': '臨', '词': '詞', '讼': '訟',
'学': '學', '习': '習', '医': '醫', '针': '針', '筑': '築',
'动': '動', '盖': '蓋', '仓': '倉', '灶': '竈', '货': '貨', '财': '財',
'会': '會', '启': '啟', '钻': '鑽',
'阳': '陽', '阴': '陰',
'冲': '衝',
'时': '時', '钟': '鐘', '节': '節', '岁': '歲', '历': '曆', '万': '萬',
'龙': '龍', '马': '馬', '鸡': '雞', '猪': '豬',
'与': '與', '为': '為', '无': '無', '关': '關', '门': '門', '闭': '閉',
'过': '過', '远': '遠', '选': '選', '遗': '遺', '补': '補', '挂': '掛',
'额': '額', '饰': '飾', '裁': '裁',
'缝': '縫', '织': '織', '经': '經', '络': '絡',
'酝': '醞', '酿': '釀',
'铸': '鑄', '敛': '斂',
'建': '建', '平': '平', '执': '執',
'刘': '劉', '黄': '黃'
};

var LANG_KEY = 'wuri_lang_v1';
var langPref = 'auto';
try { langPref = localStorage.getItem(LANG_KEY) || 'auto';} catch (e) {}

function sysLang() {
var nv = (navigator.language || navigator.userLanguage || 'zh-CN').toLowerCase();
if (nv.indexOf('zh-tw') === 0 || nv.indexOf('zh-hk') === 0) return 'zh-TW';
return 'zh-CN';
}
function curLang() {
if (langPref === 'zh-TW') return 'zh-TW';
if (langPref === 'zh-CN') return 'zh-CN';
return sysLang();
}
function setLangPref(v) {
langPref = v;
try { localStorage.setItem(LANG_KEY, v);} catch (e) {}
applyI18n();
}
function t(key) {
var L = curLang();
var s = I18N[L][key];
if (s === undefined) s = I18N['zh-CN'][key];
return s === undefined? key: s;
}
/* 历法库动态字符串转繁体（仅繁体模式） */
function tx(s) {
if (curLang()!== 'zh-TW' ||!s) return s;
return String(s).split('').map(function (ch) { return S2T[ch] || ch;}).join('');
}
function tf(fmt) {
var args = Array.prototype.slice.call(arguments, 1), i = 0;
return String(fmt).replace(/%[ds]/g, function () { return args[i++];});
}

/* 把 data-i18n 属性的静态文案全部刷成当前语言 */
function applyI18n() {
var L = curLang();
document.documentElement.setAttribute('lang', L === 'zh-TW'? 'zh-TW': 'zh-CN');
var els = document.querySelectorAll('[data-i18n]');
for (var i = 0; i < els.length; i++) {
var k = els[i].getAttribute('data-i18n');
var s = I18N[L][k];
if (s === undefined) s = I18N['zh-CN'][k];
if (s!== undefined) els[i].textContent = s;
}
var ars = document.querySelectorAll('[data-i18n-aria]');
for (var j = 0; j < ars.length; j++) {
var k2 = ars[j].getAttribute('data-i18n-aria');
var s2 = I18N[L][k2];
if (s2 === undefined) s2 = I18N['zh-CN'][k2];
if (s2!== undefined) ars[j].setAttribute('aria-label', s2);
}
var phs = document.querySelectorAll('[data-i18n-ph]');
for (var p = 0; p < phs.length; p++) {
var k3 = phs[p].getAttribute('data-i18n-ph');
var s3 = I18N[L][k3];
if (s3 === undefined) s3 = I18N['zh-CN'][k3];
if (s3!== undefined) phs[p].setAttribute('placeholder', s3);
}
try {
var lr = document.querySelectorAll('input[name=lang]');
for (var m = 0; m < lr.length; m++) lr[m].checked = (lr[m].value === langPref);
} catch (e) {}
if (window.__wuri_rerender) window.__wuri_rerender();
}

window.t = t; window.tf = tf; window.tx = tx;
window.curLang = curLang; window.setLangPref = setLangPref;
window.applyI18n = applyI18n;
})();
