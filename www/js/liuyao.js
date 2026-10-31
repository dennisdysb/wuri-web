/* 六爻占卜：铜钱摇卦
 * 三枚铜钱摇六次，自下而上成卦
 * 铜钱四格宗《增删卜易》〈占卦法〉《卜筮正宗》〈以钱代蓍法〉：
 * 三花=重·老阳○（动），两花一字=拆·少阴，一花两字=单·少阳，三字=交·老阴×（动）
 * （中间两档 2026-10-26 按两书修正，详见 coinResult 注释）
 * 装卦核心（纳甲全表、八宫世应）参照开源项目 liuyao-tool
 * （作者 1eakkkk，MIT License，https://github.com/1eakkkk/liuyao-tool）
 * 并以 bopo/najia 的独立实现交叉校验，2026-10-22 校订。
 */
var LiuYao = (function () {
  'use strict';

  /* 64卦：[卦名, 卦辞]，按二进制下爻在前 */
    var GUA = {
    '111111': ['乾', '元亨利贞。', '大吉大利。此时天时地利人和，正是奋发有为的好时机。宜主动出击、刚健不息，无论求功名、谋事业、做生意都会有成。但要注意亢龙有悔，成功后不可骄傲自满，要懂得适时收敛。'],
    '000000': ['坤', '元亨，利牝马之贞。君子有攸往，先迷后得主，利西南得朋，东北丧朋。安贞，吉。', '大吉。宜以柔克刚，像大地一样包容厚德。不要强出头，跟随贵人、顺势而为则吉。西南方向有利，宜结交朋友、合作共事。安守本分，静待时机，终会有所成就。'],
    '100010': ['屯', '元亨利贞，勿用有攸往，利建侯。', '万事开头难，如草木初生，充满艰辛。此时宜守不宜进，先打好基础，广结善缘，等待时机。不要急于求成，也不要轻举妄动。利建立基业、招贤纳士，假以时日必能亨通。'],
    '010001': ['蒙', '亨。匪我求童蒙，童蒙求我。初筮告，再三渎，渎则不告。利贞。', '蒙昧待启，如童蒙求学。此时宜虚心求教，拜师访贤，不可自作聪明。教育、学习之事大吉。占问事情，要多听取他人意见，反复请教，诚心则灵。不可亵渎神明，心不诚则不验。'],
    '111010': ['需', '有孚，光亨，贞吉。利涉大川。', '时机未到，如云在天上待雨。此时宜耐心等待，养精蓄锐，不要强求。只要心怀诚信，光明亨通终会到来。利于渡过大河（克服大难），但需等待时机，不可冒进。'],
    '010111': ['讼', '有孚，窒惕，中吉。终凶。利见大人，不利涉大川。', '有争执诉讼之象。宜和解退让，以和为贵。若心怀诚信，虽有忧惧但终得中吉。若争讼到底则凶。宜见贵人调解，不利于涉险。凡事退一步海阔天空。'],
    '010000': ['师', '贞，丈人吉，无咎。', '宜团结众人，选贤任能。像统帅带兵，纪律严明、赏罚分明则吉。得有经验的长者主持大局，无咎。利于团队合作、集体行动。'],
    '000010': ['比', '吉。原筮元永贞，无咎。不宁方来，后夫凶。', '吉祥。得贵人相助，众人亲附。宜主动亲近贤者，诚心结交，合作共赢。占卜时若心诚，则无咎。若安居不动而有人来归附，是吉象。但来得晚的会有凶险。'],
    '111011': ['小畜', '亨。密云不雨，自我西郊。', '小有积蓄，时机未完全成熟。如密云不雨，虽有云气但雨未下。宜继续积累实力，修德养望，不要急于求成。小事可为，大事待时。'],
    '110111': ['履', '履虎尾，不咥人，亨。', '如履虎尾，伴君如伴虎。行事需谨慎小心，守礼守法则亨通。虽处险境，但只要谨慎就不会被伤害。防小人暗算，言行要检点。'],
    '111000': ['泰', '小往大来，吉亨。', '大吉。天地交泰，小往大来，诸事亨通。此时阴阳调和，万事顺遂。宜积极进取，把握良机。但要居安思危，泰极可能转否。'],
    '000111': ['否', '否之匪人，不利君子贞，大往小来。', '运势闭塞，天地不交。此时小人得势，君子退避。不利主动进取，宜守旧待时，韬光养晦。不要与小人争锋，保存实力等待转机。'],
    '101111': ['同人', '同人于野，亨。利涉大川，利君子贞。', '宜团结众人，志同道合。如在野外与众人会合，光明亨通。利于克服大难，君子守正则吉。众人拾柴火焰高，合作必成。'],
    '111101': ['大有', '元亨。', '大吉。收获丰厚，如日中天。此时宜分享成果，惠及众人，不可独占。防骄奢淫逸，要懂得回馈。继续保持谦逊，则长久亨通。'],
    '001000': ['谦', '亨，君子有终。', '大吉。谦逊受益，如山在地下。无论做什么，低调谦逊必得众人拥戴，有始有终。君子以谦德立身，无往不利。'],
    '000100': ['豫', '利建侯行师。', '宜未雨绸缪，提前准备。如雷出大地，万物振奋。利于建立侯国、兴兵动众。但要防备安逸享乐，要居安思危。'],
    '100110': ['随', '元亨利贞，无咎。', '宜顺势而为，如影随形。跟随明主、顺应时势则元亨利贞。做事要随机应变，不可固执己见。晚上休息好，白天才有精神办事。'],
    '011001': ['蛊', '元亨，利涉大川。先甲三日，后甲三日。', '积弊已深，如器皿生虫。此时必须果断整顿，拨乱反正。做事要有始有终，先甲三日、后甲三日（慎始慎终）。利于渡过大难，革新除弊。'],
    '110000': ['临', '元亨利贞。至于八月有凶。', '运势上升，如居高临下。此时元亨利贞，宜亲力亲为，深入基层。但要防备八月（长久之后）有凶险，不可掉以轻心。'],
    '000011': ['观', '盥而不荐，有孚顒若。', '宜观察时势，如盥洗后不进献，诚敬专一。有诚信则如瞻仰般受人敬重。做事要先观察清楚，再行动。修身立德，以德服人。'],
    '100101': ['噬嗑', '亨。利用狱。', '亨通。如咬合硬物，必须用力。此时宜果断除障，遇到阻碍要用强力排除。利于用刑狱对付小人。但要注意适度，不可过分。'],
    '101001': ['贲', '亨。小利有攸往。', '亨通。宜修饰文饰，如装饰外表。小事可往，大事要谨慎。重实质轻形式，文质彬彬才好。不可过分追求外表华丽。'],
    '000001': ['剥', '不利有攸往。', '运势下滑，如秋果剥落。此时不利有攸往，宜固守待时，不可冒进。要防小人剥蚀，如床脚被剥蚀则凶。保存实力，等待复苏。'],
    '100000': ['复', '亨。出入无疾，朋来无咎。反复其道，七日来复，利有攸往。', '转机已到，如阳气复返。此时亨通，出入无疾，朋友来助无咎。反复其道，七日来复。宜把握复苏之机，积极行动。'],
    '100111': ['无妄', '元亨利贞。其匪正有眚，不利有攸往。', '宜守正不妄动。如天下雷行，动以天理。元亨利贞，但行为不正会有灾殃，不利有攸往。不要有非分之想，实事求是则吉。'],
    '111001': ['大畜', '利贞，不家食吉，利涉大川。', '大有积蓄，如天在山中。此时利守正，不在家吃饭（要外出谋事）吉，利涉大川。宜继续充电学习，厚积薄发。'],
    '100001': ['颐', '贞吉。观颐，自求口实。', '养身养德之时，如颐养天年。守正则吉。要观察颐养之道，自求口实（自食其力）。注意饮食健康，不可贪求。'],
    '011110': ['大过', '栋桡，利有攸往，亨。', '非常之时，如栋梁弯曲。此时利有攸往，亨通。需要果断担当，独立不惧，虽险可亨。但要防栋梁倾折，根基不稳。'],
    '010010': ['坎', '习坎，有孚，维心亨，行有尚。', '险中有险，如重重险陷。此时有诚信则维心亨通，行动有尚。宜坚守诚信，一步一个脚印，不可投机取巧。终可脱险上岸。'],
    '101101': ['离', '利贞，亨。畜牝牛，吉。', '宜依附光明，如火附着。利守正，亨通。畜养母牛则吉（培养柔顺之德）。做事要光明磊落，依附正道。'],
    '001110': ['咸', '亨，利贞，取女吉。', '感应相通，如少男少女相感。此时亨通，利守正，娶女吉。心诚则灵，感应神速。感情婚姻之事大吉。'],
    '011100': ['恒', '亨，无咎，利贞，利有攸往。', '宜持之以恒，如雷风相随。亨通无咎，利守正，利有攸往。做事要有恒心，不可三心二意。久则生变，要与时俱进。'],
    '001111': ['遁', '亨，小利贞。', '宜退避三舍，如天在山下。此时亨通，小利守正。暂避锋芒不是懦弱，而是保存实力。君子以远小人，不恶而严。'],
    '111100': ['大壮', '利贞。', '气势正盛，如雷在天上。此时利守正。但要注意过刚易折，不可恃强凌弱。君子以非礼弗履，守正则吉。'],
    '000101': ['晋', '康侯用锡马蕃庶，昼日三接。', '运势上进，如日初升。此时康侯受赏，赏赐丰厚。宜积极进取，得贵人提携。一日三接见，机会多多。'],
    '101000': ['明夷', '利艰贞。', '光明受损，如日在地下。此时利艰难守正。宜韬光养晦，坚守正道。虽处黑暗，但内心光明，终会再现。'],
    '101011': ['家人', '利女贞。', '家和万事兴。此时利女守正。治家要严而有度，言行有物，行止有恒。家庭和睦是事业成功的基础。'],
    '110101': ['睽', '小事吉。', '意见相左，如火泽相违。此时小事吉，大事要谨慎。宜求同存异，以诚待人。虽睽违但终可和合。'],
    '001010': ['蹇', '利西南，不利东北；利见大人，贞吉。', '前行艰难，如山上有水。此时利西南，不利东北。宜见大人，守正则吉。遇到困难不要硬闯，换个方向或求助贵人。'],
    '010100': ['解', '利西南，无所往，其来复吉。有攸往，夙吉。', '困境得解，如雷雨交作。此时利西南。无所往则来复吉，有攸往则早吉。宜速行动，抓住机会，解除困境。'],
    '110001': ['损', '有孚，元吉，无咎，可贞，利有攸往。曷之用，二簋可用享。', '先损后益，如山下有泽。此时有诚信则元吉无咎，可守正，利有攸往。用两个簋祭祀都可以（重诚不重物）。宜舍小取大。'],
    '100011': ['益', '利有攸往，利涉大川。', '大吉。如风雷相助。此时利有攸往，利涉大川。宜积极进取，损上益下（帮助他人）。助人者人恒助之。'],
    '111110': ['夬', '扬于王庭，孚号，有厉，告自邑，不利即戎，利有攸往。', '宜果断决裂，如泽在天上。此时要扬于王庭（公开），有诚信则号呼有厉。告自邑（从内部整顿），不利动武，利有攸往。'],
    '011111': ['姤', '女壮，勿用取女。', '有意外之遇，如女壮相遇。此时勿用娶女（防桃色纠纷）。做事要谨慎，防小人乘虚而入。'],
    '000110': ['萃', '亨。王假有庙，利见大人，亨，利贞。用大牲吉，利有攸往。', '人才荟萃，如泽在地上。此时亨通。王至宗庙，利见大人。宜聚集众人，用大事则吉。团结就是力量。'],
    '011000': ['升', '元亨，用见大人，勿恤，南征吉。', '步步高升，如地中生木。此时元亨。用见大人，勿忧虑。南征吉。宜积极向上，见贵人，往南方发展有利。'],
    '010110': ['困', '亨，贞，大人吉，无咎，有言不信。', '身困道亨，如泽无水。此时亨通，守正，大人吉无咎。但言语难取信于人。虽处困境，但坚守正道终会脱困。'],
    '011010': ['井', '改邑不改井，无丧无得，往来井井。汔至，亦未繘井，羸其瓶，凶。', '宜修德养民，如水井养人。此时改邑不改井，功成勿败垂成。做事要有恒心，不可半途而废。汲水要用绳，若瓶破则凶。'],
    '101110': ['革', '己日乃孚，元亨利贞，悔亡。', '变革之时，如泽中有火。此时己日乃孚（变革后才有诚信），元亨利贞，悔亡。时机成熟则变革，不可守旧。'],
    '011101': ['鼎', '元吉，亨。', '大吉。如木上有火，鼎新革故。此时元吉亨通。宜正位凝命（端正位置），革故鼎新。承担重任，必能成功。'],
    '100100': ['震', '亨。震来虩虩，笑言哑哑。震惊百里，不丧匕鬯。', '有惊无险，如雷震百里。此时亨通。虽震来虩虩（恐惧），但笑言哑哑（谈笑自若）。不丧匕鬯（不失祭器），守成为要。'],
    '001001': ['艮', '艮其背，不获其身，行其庭，不见其人，无咎。', '宜止则止，如山止不动。此时艮其背，不获其身。行其庭不见其人，无咎。知止不殆，行止有度。'],
    '001011': ['渐', '女归吉，利贞。', '循序渐进，如鸿雁渐进。此时女归吉，利守正。做事不可急躁，要一步一个脚印。渐进则吉，骤进则凶。'],
    '110100': ['归妹', '征凶，无攸利。', '征凶。如少女出嫁，急于求成。此时无所利。婚姻大事宜慎重，不可草率。急进则凶，缓进则吉。'],
    '101100': ['丰', '亨，王假之，勿忧，宜日中。', '丰盛之时，如雷火交加。此时亨通，王假之（王至丰地）。勿忧，宜日中（保持中道）。要居安思危，防盛极转衰。'],
    '001101': ['旅', '小亨，旅贞吉。', '羁旅在外，如火在山上。此时小亨，守贞则吉。出行在外要谨慎，防居无定所。虽小亨，但不可大事。'],
    '011011': ['巽', '小亨，利有攸往，利见大人。', '宜顺从谦逊，如风相随。此时小亨，利有攸往，利见大人。以柔克刚，顺势而为。反复申命，行事有章。'],
    '110110': ['兑', '亨，利贞。', '喜悦和合，如泽相连。此时亨通，利守正。以诚待人，和气生财。朋友相聚，言讲习道。'],
    '010011': ['涣', '亨。王假有庙，利涉大川，利贞。', '涣散待聚，如风行水上。此时亨通。王至宗庙，利涉大川，利守正。宜收拾人心，凝聚力量。'],
    '110010': ['节', '亨。苦节不可贞。', '宜有节制，如泽上有水。此时亨通。但苦节不可守正（过分节制则凶）。凡事适度，节制有度则吉。'],
    '110011': ['中孚', '豚鱼吉，利涉大川，利贞。', '诚信感通，如泽上有风。此时豚鱼吉（连猪鱼都感动），利涉大川，利守正。心诚则灵，以信待人。'],
    '001100': ['小过', '亨，利贞，可小事，不可大事。飞鸟遗之音，不宜上宜下，大吉。', '小有过越，如雷在山上。此时亨通，利守正。可小事不可大事。飞鸟遗音，不宜上宜下。宜下不宜上，谦逊则大吉。'],
    '101010': ['既济', '亨，小利贞，初吉终乱。', '初吉终乱，如水在火上。此时亨通，小利守正。事已成要防微杜渐，居安思危。初吉终乱，不可大意。'],
    '010101': ['未济', '亨，小狐汔济，濡其尾，无攸利。', '事未成，如火在水上。此时亨通。小狐渡河，濡其尾，无所利。虽未济但终可济，要谨慎，不可冒进。'],
  };

  /* ============ 纳甲六亲六兽世应 ============ */
  // 八宫：宫名, 宫五行, 本宫8卦(按二进制key)
  var BAGONG = (function () {
    /* 标准八宫卦名归属，反查 GUA 生成二进制 key，避免手写遗漏 */
    var palaceNames = {
      '乾': ['乾', '姤', '遁', '否', '观', '剥', '晋', '大有'],
      '坎': ['坎', '节', '屯', '既济', '革', '丰', '明夷', '师'],
      '艮': ['艮', '贲', '大畜', '损', '睽', '履', '中孚', '渐'],
      '震': ['震', '豫', '解', '恒', '升', '井', '大过', '随'],
      '巽': ['巽', '小畜', '家人', '益', '无妄', '噬嗑', '颐', '蛊'],
      '离': ['离', '旅', '鼎', '未济', '蒙', '涣', '讼', '同人'],
      '坤': ['坤', '复', '临', '泰', '大壮', '夬', '需', '比'],
      '兑': ['兑', '困', '萃', '咸', '蹇', '谦', '小过', '归妹']
    };
    var palaceWx = { '乾': '金', '兑': '金', '坎': '水', '艮': '土', '坤': '土', '震': '木', '巽': '木', '离': '火' };
    var nameToKey = {};
    for (var k in GUA) if (GUA.hasOwnProperty(k)) nameToKey[GUA[k][0]] = k;
    var ret = [];
    for (var p in palaceNames) if (palaceNames.hasOwnProperty(p)) {
      var keys = [];
      for (var i = 0; i < palaceNames[p].length; i++) {
        var kk = nameToKey[palaceNames[p][i]];
        if (kk) keys.push(kk);
      }
      ret.push([p, palaceWx[p], keys]);
    }
    return ret;
  })();
  // 纳干：[外卦干, 内卦干]，key 为经卦三爻自下而上的二进制（与 GUA key 同序，不可反转）
  // 乾内甲外壬、坤内乙外癸、震庚、巽辛、坎戊、离己、艮丙、兑丁
  var NA_GAN = { '111': ['壬', '甲'], '000': ['癸', '乙'], '100': ['庚', '庚'], '011': ['辛', '辛'], '010': ['戊', '戊'], '101': ['己', '己'], '001': ['丙', '丙'], '110': ['丁', '丁'] };
  /* 纳甲流派（2026-10-31 用户拍板，照八字晚子时流派开关同例）：
   * 流派1＝京房纳甲固定表（默认，与此前一致）；流派2＝二老时迁，宗《易冒》
   * 「二老时迁，三少不变，则干支六十，可得而具焉」：仅乾、坤（二老）纳干随
   * 阴阳遁换位，纳支全不动，其余六卦（三少）两派一致。
   * 阳遁（冬至时刻起→次年夏至时刻前）：同固定表——乾内甲外壬、坤内乙外癸；
   * 阴遁（夏至时刻起→冬至时刻前）：乾内壬外甲、坤内癸外乙（即下表：固定表乾坤内外干互换）。
   * 遁期按起卦时间的夏至/冬至精确时刻判定（lunar-javascript 节气表，精确到秒），不用日期粗判。 */
  var NA_GAN_YIN = { '111': ['甲', '壬'], '000': ['乙', '癸'] };  // 阴遁乾坤：[外干, 内干]
  var lySect = 1;
  try { var _lySectSaved = +localStorage.getItem('wuri_ly_sect'); if (_lySectSaved === 1 || _lySectSaved === 2) lySect = _lySectSaved; } catch (e) {}
  /* 起卦时刻是否阴遁：取起卦年及前后一年节气表内全部夏至/冬至精确时刻
   * （表内同一节气有中文键与英文键两份，值同为 Solar 精确时刻，按 名|时刻 去重），
   * 最近一个已过至点为夏至→阴遁、为冬至→阳遁。跨年天然成立：1 月回溯到上年 12 月冬至（阳遁）、
   * 12 月冬至后亦然；至点本刻起入新遁（<= 含本刻）。 */
  function lyIsYinDun(date) {
    try {
      if (!date || !window.Lunar) return false;
      var t = date.getTime();
      var seen = {}, sols = [];
      for (var dy = -1; dy <= 1; dy++) {
        var table = window.Lunar.fromDate(new Date(date.getFullYear() + dy, 5, 15, 12, 0, 0)).getJieQiTable();
        for (var k in table) {
          var nm = (k === 'XIA_ZHI') ? '夏至' : ((k === 'DONG_ZHI') ? '冬至' : k);
          if (nm !== '夏至' && nm !== '冬至') continue;
          var so = table[k];  // 本版 Solar 无 toDate()，按字段组装本地时刻（与全站设备本地时间口径同）
          var st = new Date(so.getYear(), so.getMonth() - 1, so.getDay(), so.getHour(), so.getMinute(), so.getSecond()).getTime();
          var skey = nm + '|' + st;
          if (!seen[skey]) { seen[skey] = 1; sols.push({ name: nm, t: st }); }
        }
      }
      var best = null;
      for (var si = 0; si < sols.length; si++) if (sols[si].t <= t && (!best || sols[si].t > best.t)) best = sols[si];
      return !!best && best.name === '夏至';
    } catch (e) { return false; }
  }
  /* 纳干查表（唯一入口）：流派2＋阴遁＋乾/坤才换，其余一律固定表。
   * date 缺省（无从定遁期的内部调用）→固定表，保证流派1 与旧行为逐字不变。 */
  function naGanOf(guaKey3, date) {
    if (lySect === 2 && (guaKey3 === '111' || guaKey3 === '000') && date && lyIsYinDun(date)) return NA_GAN_YIN[guaKey3];
    return NA_GAN[guaKey3];
  }
  // 纳支起支：[内卦起支, 外卦起支]（京房纳甲正表，内外必须分开起）
  // 内：乾子 坤未 震子 巽丑 坎寅 离卯 艮辰 兑巳
  // 外：乾午 坤丑 震午 巽未 坎申 离酉 艮戌 兑亥
  var NA_ZHI_START = { '111': ['子', '午'], '000': ['未', '丑'], '100': ['子', '午'], '011': ['丑', '未'], '010': ['寅', '申'], '101': ['卯', '酉'], '001': ['辰', '戌'], '110': ['巳', '亥'] };
  // 阳卦（乾震坎艮）纳支顺行，阴卦（巽离坤兑）逆行
  var YANG_GUA = { '111': 1, '100': 1, '010': 1, '001': 1 };
  var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var ZHI_WX = { '子': '水', '丑': '土', '寅': '木', '卯': '木', '辰': '土', '巳': '火', '午': '火', '未': '土', '申': '金', '酉': '金', '戌': '土', '亥': '水' };
  function zhiIdx(z) { return ZHI.indexOf(z); }
  // 六亲：以宫五行为我
  function liuqin(gongWx, yaoWx) {
    if (gongWx === yaoWx) return '兄弟';
    var sheng = { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' };
    var ke = { '木': '土', '土': '水', '水': '火', '火': '金', '金': '木' };
    if (sheng[yaoWx] === gongWx) return '父母'; // 生我
    if (sheng[gongWx] === yaoWx) return '子孙'; // 我生
    if (ke[gongWx] === yaoWx) return '妻财';   // 我克
    return '官鬼'; // 克我
  }
  // 六兽：按日干
  function liushou(dayGan) {
    var start = { '甲': 0, '乙': 0, '丙': 1, '丁': 1, '戊': 2, '己': 3, '庚': 4, '辛': 4, '壬': 5, '癸': 5 }[dayGan] || 0;
    var beasts = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];
    var r = [];
    for (var i = 0; i < 6; i++) r.push(beasts[(start + i) % 6]);
    return r;
  }
  // 世应：由八宫序位生成——[本宫, 一世, 二世, 三世, 四世, 五世, 游魂, 归魂]
  // 对应世爻位（1-6，自下而上）为 [6, 1, 2, 3, 4, 5, 4, 3]，应爻恒在世爻对面（隔两位）
  var SHI_BY_POS = [6, 1, 2, 3, 4, 5, 4, 3];
  function getShiYing(guaKey) {
    for (var i = 0; i < BAGONG.length; i++) {
      var pos = BAGONG[i][2].indexOf(guaKey);
      if (pos >= 0) {
        var shi = SHI_BY_POS[pos] - 1;
        return { shi: shi, ying: (shi + 3) % 6 };
      }
    }
    return { shi: 0, ying: 3 };
  }
  function getGong(guaKey) {
    for (var i = 0; i < BAGONG.length; i++) {
      if (BAGONG[i][2].indexOf(guaKey) >= 0) return { name: BAGONG[i][0], wx: BAGONG[i][1] };
    }
    return { name: '?', wx: '?' };
  }
  // 纳甲装卦：返回每爻 {gan, zhi}（自下而上）
  // guaKey 为 6 位、下爻在前；经卦 key 直接取前/后 3 位（自下而上），严禁反转——
  // 反转会把巽(011)认成兑、震(100)认成艮（2026-10-22 已修复的历史错误）
  function najia(guaKey, date) {
    var lowerKey = guaKey.slice(0, 3);
    var upperKey = guaKey.slice(3, 6);
    var res = [];
    var zi = zhiIdx(NA_ZHI_START[lowerKey][0]);
    var neiYang = !!YANG_GUA[lowerKey];
    var ganNei = naGanOf(lowerKey, date);
    for (var i = 0; i < 3; i++) {
      // 内卦初二三爻：隔位跳（阳顺 子→寅→辰；阴逆 未→巳→卯）
      res.push({ gan: ganNei[1], zhi: ZHI[(zi + (neiYang ? i * 2 : -i * 2) + 24) % 12] });
    }
    zi = zhiIdx(NA_ZHI_START[upperKey][1]);
    var waiYang = !!YANG_GUA[upperKey];
    var ganWai = naGanOf(upperKey, date);
    for (var j = 0; j < 3; j++) {
      // 外卦四五上爻：自外卦起支另起（乾外午、坤外丑……），不可与内卦同起点
      res.push({ gan: ganWai[0], zhi: ZHI[(zi + (waiYang ? j * 2 : -j * 2) + 24) % 12] });
    }
    return res;
  }
  // 旬空：按日柱天干地支
  function xunkong(dayGanZhi) {
    var gan = dayGanZhi[0], zhi = dayGanZhi[1];
    var xunMap = { '子': '戌亥', '戌': '申酉', '申': '午未', '午': '辰巳', '辰': '寅卯', '寅': '子丑' };
    // 找旬首：地支往前推到子/戌/申/午/辰/寅
    var zi = zhiIdx(zhi);
    var ganIdx = '甲乙丙丁戊己庚辛壬癸'.indexOf(gan);
    // 旬首地支 = 日支 - 天干序
    var xunZhi = ZHI[(zi - ganIdx + 24) % 12];
    // 规范到六甲旬首
    var xunKeys = ['子', '戌', '申', '午', '辰', '寅'];
    var xk = xunKeys[Math.floor(xunKeys.indexOf(xunZhi) / 1)] || '子';
    // 简化：直接用映射
    for (var k in xunMap) { if (xunZhi === k) return xunMap[k]; }
    return '';
  }
  /* ================= 断卦层：事类、用神与结构判读引擎 =================
   * 规则宗《增删卜易》《卜筮正宗》通行口径，按本站《二期断卦层蓝本》的
   * 六步框架（定用神→旺衰→世应→动爻作用→特殊格局）自写实现；
   * 校验思路参考 fortune-liuyao-skill（Apache-2.0）的黄金卦例回归法，
   * 未复制其代码与文案。装卦数据全部取自上方既有核心
   * （najia / getShiYing / getGong / liuqin / liushou），本层不另算盘。
   * 红线：只输出结构与状态（用神是谁、旺衰如何、生克方向、动变名目），
   * 不下吉凶成败断语，不给具体行动指令（与全站免责正本一致）。 */
  var LY_TOPICS = [
    { k: '', label: '不选' }, { k: 'cai', label: '求财' }, { k: 'shi', label: '事业' },
    { k: 'hun', label: '婚恋' }, { k: 'jian', label: '健康' }, { k: 'xing', label: '出行' },
    { k: 'kao', label: '考试' }, { k: 'shiwu', label: '失物' }, { k: 'qi', label: '其他' }
  ];
  function topicLabel(k) {
    for (var i = 0; i < LY_TOPICS.length; i++) if (LY_TOPICS[i].k === k) return LY_TOPICS[i].label;
    return '不选';
  }
  var lyTopic = { cat: '', gender: 'm' };
  function loadTopic() {
    try {
      var t = JSON.parse(localStorage.getItem('wuri_ly_topic') || 'null');
      if (t && typeof t.cat === 'string') {
        lyTopic = { cat: t.cat, gender: t.gender === 'f' ? 'f' : 'm' };
        return;
      }
      /* 迁移旧版归档分类（中文标签） */
      var old = localStorage.getItem('wuri_ly_cat') || '';
      var map = { '综合': '', '感情': 'hun', '事业': 'shi', '财运': 'cai', '健康': 'jian', '学业': 'kao', '出行': 'xing', '失物': 'shiwu', '其他': 'qi' };
      if (Object.prototype.hasOwnProperty.call(map, old)) lyTopic.cat = map[old];
    } catch (e) {}
  }
  function saveTopic() {
    try {
      localStorage.setItem('wuri_ly_topic', JSON.stringify(lyTopic));
      localStorage.setItem('wuri_ly_cat', topicLabel(lyTopic.cat));
    } catch (e) {}
  }
  loadTopic();

  var DG_SHENG = { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' };
  var DG_KE = { '木': '土', '土': '水', '水': '火', '火': '金', '金': '木' };
  var DG_CHONG = { '子': '午', '午': '子', '丑': '未', '未': '丑', '寅': '申', '申': '寅', '卯': '酉', '酉': '卯', '辰': '戌', '戌': '辰', '巳': '亥', '亥': '巳' };
  var DG_HE = { '子': '丑', '丑': '子', '寅': '亥', '亥': '寅', '卯': '戌', '戌': '卯', '辰': '酉', '酉': '辰', '巳': '申', '申': '巳', '午': '未', '未': '午' };
  /* 进神：同五行地支顺进（亥→子、寅→卯、巳→午、申→酉；土序 辰→未→戌→丑→辰） */
  var DG_JIN = { '亥': '子', '寅': '卯', '巳': '午', '申': '酉', '辰': '未', '未': '戌', '戌': '丑', '丑': '辰' };
  var DG_TUI = {};
  for (var djk in DG_JIN) DG_TUI[DG_JIN[djk]] = djk;
  /* a 对 b 的关系（站在 a 看 b）：生=a生b，克=a克b，被生=b生a，被克=b克a */
  function dgRel(aWx, bWx) {
    if (aWx === bWx) return '比和';
    if (DG_SHENG[aWx] === bWx) return '生';
    if (DG_KE[aWx] === bWx) return '克';
    if (DG_SHENG[bWx] === aWx) return '被生';
    return '被克';
  }
  var DG_BEAST_NOTE = { '青龙': '喜庆、正大', '朱雀': '口舌、文书', '勾陈': '迟滞、牵绊', '螣蛇': '虚惊、缠绕', '白虎': '刚硬、伤损', '玄武': '隐秘、暧昧' };
  var DG_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

  /* 伏神（与盘面同一算法：本宫首卦中、本卦所缺六亲对应的爻位） */
  function computeFu(key, gong, nj, date) {
    var out = [];
    try {
      var pureKey = null;
      for (var bi = 0; bi < BAGONG.length; bi++) {
        if (BAGONG[bi][0] === gong.name) { pureKey = BAGONG[bi][2][0]; break; }
      }
      if (!pureKey) return out;
      var pureNj = najia(pureKey, date);
      var curQin = {};
      for (var ci = 0; ci < 6; ci++) curQin[liuqin(gong.wx, ZHI_WX[nj[ci].zhi])] = 1;
      for (var fi = 0; fi < 6; fi++) {
        var fq = liuqin(gong.wx, ZHI_WX[pureNj[fi].zhi]);
        if (!curQin[fq]) out.push({ pos: fi, qin: fq, gan: pureNj[fi].gan, zhi: pureNj[fi].zhi, wx: ZHI_WX[pureNj[fi].zhi] });
      }
    } catch (e) {}
    return out;
  }

  /* 单爻旺衰：以月建、日辰对该爻地支的生克冲合定力量（蓝本第 2 步）。
     月破并入旺衰评分：逢月建冲破 score −2，同时以「月破」tag 标注；
     旬空不在本函数内处理，由判读层（wsText）在旺衰文本之后单独标注。 */
  function dgWangShuai(zhi, monthZhi, dayGz) {
    var wx = ZHI_WX[zhi];
    var tags = [], score = 0;
    if (monthZhi) {
      var mwx = ZHI_WX[monthZhi];
      if (monthZhi === zhi) { tags.push('临月建'); score += 2; }
      else if (DG_CHONG[monthZhi] === zhi) { tags.push('月破（逢月建冲破）'); score -= 2; }
      else {
        var mr = dgRel(mwx, wx);
        if (mr === '生') { tags.push('得月建生扶'); score += 1; }
        else if (mr === '克') { tags.push('受月建克制'); score -= 1; }
        else if (mr === '被克') { tags.push('克月建（无力）'); score -= 1; }
        else if (mr === '被生') { tags.push('泄气于月建'); }
      }
    }
    var dayZhi = dayGz ? dayGz[1] : '';
    if (dayZhi) {
      var dwx = ZHI_WX[dayZhi];
      if (dayZhi === zhi) { tags.push('临日辰'); score += 2; }
      else if (DG_CHONG[dayZhi] === zhi) { tags.push('逢日辰冲'); }
      else {
        var dr = dgRel(dwx, wx);
        if (dr === '生') { tags.push('得日辰生扶'); score += 1; }
        else if (dr === '克') { tags.push('受日辰克制'); score -= 1; }
      }
    }
    var level = score >= 2 ? '旺相有力' : (score === 1 ? '有气偏旺' : (score === 0 ? '力量平和（临界）' : (score === -1 ? '偏弱' : '休囚无力')));
    return { level: level, tags: tags, score: score };
  }
  /* 静爻逢日冲：旺相者暗动、休囚者日破；动爻逢日冲为冲动/冲散之象 */
  function dgDayClash(zhi, dong, wsScore, dayGz) {
    var dayZhi = dayGz ? dayGz[1] : '';
    if (!dayZhi || DG_CHONG[dayZhi] !== zhi) return '';
    if (dong) return '动而逢日冲，有被冲动或冲散之象';
    return wsScore >= 1 ? '静而逢日冲、本身旺相，为暗动（表面安静、暗中起作用）' : '静而逢日冲、本身休囚，为日破（被日辰冲破）';
  }

  /* 事类→用神配置（通行取法） */
  function topicYong(topic, gender) {
    switch (topic) {
      case 'cai': return { mains: [{ qin: '妻财', role: '用神' }], note: '求财以妻财为用神（所求之财），另参子孙（财源）与兄弟（劫财之象）的状态。' };
      case 'shi': return { mains: [{ qin: '官鬼', role: '用神' }], note: '事业以官鬼为用神（工作、职位、上级），另参父母（文书、合同）。' };
      case 'hun': return gender === 'f'
        ? { mains: [{ qin: '官鬼', role: '用神' }], note: '婚恋女问以官鬼为用神（所问的男方），并重看世应关系。' }
        : { mains: [{ qin: '妻财', role: '用神' }], note: '婚恋男问以妻财为用神（所问的女方），并重看世应关系。' };
      case 'jian': return { mains: [{ qin: '官鬼', role: '病症' }, { qin: '子孙', role: '医药' }], note: '健康双看：官鬼代表病症、子孙代表医药，世爻为自身。此处只描述卦象结构，不作任何医疗判断，身体不适请就医。' };
      case 'kao': return { mains: [{ qin: '父母', role: '用神' }, { qin: '官鬼', role: '名次' }], note: '考试以父母为用神（文书、成绩），官鬼主名次与录取，一并参看。' };
      case 'shiwu': return { mains: [{ qin: '妻财', role: '用神' }], note: '失物以妻财为用神（财物类）；若所失为文书、证件，则以父母爻参看。' };
      case 'xing': return { mains: [], shiMain: true, note: '出行以世爻为自身用神，应爻为目的地与同行人，另参父母（行程、票据）。' };
      default: return { mains: [], note: '' };
    }
  }

  /* 结构判读引擎：入参为爻象数组与历法信息，输出分段结论（纯文本行）。
     判读卡与 AI 文本共用此函数，保证两处口径一致。 */
  function computeDuan(linesArr, info, topic, gender) {
    var key = guaKey(linesArr);
    var gong = getGong(key);
    var sy = getShiYing(key);
    var nj = najia(key, info.date || null);
    var monthZhi = info.monthZhi || '', dayGz = info.dayGz || '', xk = info.xk || '';
    var beasts = [];
    try { beasts = liushou(info.dayGan || '甲') || []; } catch (e) {}
    var hasDong = linesArr.some(function (l) { return l.dong; });
    var bianNj = null, bianKey = null;
    if (hasDong) {
      bianKey = guaKey(linesArr.map(function (l) { return { yao: l.dong ? (1 - l.yao) : l.yao }; }));
      bianNj = najia(bianKey, info.date || null);
    }
    var Y = [];
    for (var i = 0; i < 6; i++) {
      Y.push({
        i: i, name: DG_NAMES[i], gan: nj[i].gan, zhi: nj[i].zhi, wx: ZHI_WX[nj[i].zhi],
        qin: liuqin(gong.wx, ZHI_WX[nj[i].zhi]), dong: !!linesArr[i].dong,
        kong: !!(xk && xk.indexOf(nj[i].zhi) >= 0),
        bianZhi: bianNj ? bianNj[i].zhi : '', bianWx: bianNj ? ZHI_WX[bianNj[i].zhi] : ''
      });
    }
    function desc(y) { return y.name + ' ' + y.qin + y.gan + y.zhi + '（' + y.wx + '）'; }
    function wsText(y) {
      var ws = dgWangShuai(y.zhi, monthZhi, dayGz);
      var s = ws.level + (ws.tags.length ? '（' + ws.tags.join('、') + '）' : '');
      if (y.kong) s += '；逢旬空（空亡：暂时落空，待出空、填实之时再论）';
      return { text: s, score: ws.score };
    }
    var rows = [];

    /* ---- 第 1 步：定用神 ---- */
    var ty = topicYong(topic, gender);
    var yongIdx = [];
    var yongRole = {};   // 爻位→用神角色名（应期步标注用）
    var fuYong = null;   // 首个不上卦的用神（走伏神者），供第 6 步应期出伏候选
    var yItems = [];
    if (!topic) {
      yItems.push('未选择所问之事：不取用神，以下只给出世应、动爻与格局的通用结构判读。');
    } else {
      yItems.push('事类：' + topicLabel(topic) + (topic === 'hun' ? '（' + (gender === 'f' ? '女问' : '男问') + '）' : '') + '。' + ty.note);
      if (ty.shiMain) {
        yongIdx.push(sy.shi);
        yongRole[sy.shi] = '用神（世爻自身）';
        yItems.push('用神（世爻自身）：' + desc(Y[sy.shi]) + (Y[sy.shi].dong ? '，且为动爻' : ''));
      }
      var fuList = null;
      ty.mains.forEach(function (m) {
        var found = Y.filter(function (y) { return y.qin === m.qin; });
        if (found.length) {
          if (found.length > 1) yItems.push(m.role + '「' + m.qin + '」多现（共 ' + found.length + ' 处）：以发动者为主看，无发动者以先列者为主，其余参看。');
          found.forEach(function (y) {
            yongIdx.push(y.i);
            yongRole[y.i] = m.role;
            yItems.push(m.role + '：' + desc(y) + (y.dong ? '（发动）' : '')
              + (beasts[y.i] && DG_BEAST_NOTE[beasts[y.i]] ? '，临' + beasts[y.i] + '（六神定性：' + DG_BEAST_NOTE[beasts[y.i]] + '，仅作辅助参考）' : ''));
          });
        } else {
          if (!fuList) fuList = computeFu(key, gong, nj, info.date || null);
          var fus = fuList.filter(function (f) { return f.qin === m.qin; });
          if (fus.length) {
            var f0 = fus[0];
            if (!fuYong) fuYong = { role: m.role, fu: f0 };
            var fei = Y[f0.pos];
            var fr = dgRel(fei.wx, f0.wx);
            var frTxt = fr === '生' ? '飞神生伏神：伏神得生扶，较易透出起作用'
              : fr === '克' ? '飞神克伏神：伏神受压制，难以透出'
              : fr === '被生' ? '伏神生飞神：伏神泄气外出' : fr === '被克' ? '伏神克飞神' : '飞伏比和';
            var fws = dgWangShuai(f0.zhi, monthZhi, dayGz);
            yItems.push(m.role + '「' + m.qin + '」不上卦，伏于' + DG_NAMES[f0.pos] + '（' + desc(fei) + '）之下，伏神为 ' + f0.qin + f0.gan + f0.zhi + '（' + f0.wx + '）。'
              + frTxt + '；伏神自身旺衰：' + fws.level + (fws.tags.length ? '（' + fws.tags.join('、') + '）' : '') + '。');
          } else {
            yItems.push(m.role + '「' + m.qin + '」不上卦，伏神中亦无：本卦不见此六亲。');
          }
        }
      });
    }
    rows.push({ label: '用神', items: yItems });

    /* ---- 第 2 步：用神旺衰（无用神时看世爻） ---- */
    var wItems = [];
    var wTargets = yongIdx.length ? yongIdx : [sy.shi];
    var seenW = {};
    wTargets.forEach(function (ix) {
      if (seenW[ix]) return; seenW[ix] = 1;
      var y = Y[ix];
      var w = wsText(y);
      wItems.push((yongIdx.length ? '' : '（世爻）') + desc(y) + '：' + w.text + '。');
    });
    if (monthZhi || dayGz) wItems.push('旺衰以月建（' + (monthZhi || '?') + '月）与日辰（' + (dayGz || '?') + '）为衡量根基。');
    rows.push({ label: '旺衰', items: wItems });

    /* ---- 第 3 步：世应关系 ---- */
    var sY = Y[sy.shi], yY = Y[sy.ying];
    var sr = dgRel(sY.wx, yY.wx);
    var srTxt = sr === '比和' ? '世应比和：世、应五行相同（同为' + sY.wx + '），主双方相当、关系平稳'
      : sr === '被生' ? '应生世：应爻生世爻，对方或所问环境对世爻有生扶之象'
      : sr === '生' ? '世生应：世爻生应爻，世爻一方多有付出与耗泄'
      : sr === '克' ? '世克应：世爻克应爻，世爻对所问一方有制约之象'
      : '应克世：应爻克世爻，世爻受对方或环境制约之象';
    var sItems = ['世爻＝问卦人自身：' + desc(sY) + '；应爻＝对方或所问之事的承载方：' + desc(yY) + '。', srTxt + '。'];
    if (DG_HE[sY.zhi] === yY.zhi) sItems.push('世应地支相合（' + sY.zhi + yY.zhi + '合）：彼此牵连较深。');
    rows.push({ label: '世应', items: sItems });

    /* ---- 第 4 步：动爻作用链 ---- */
    var dItems = [];
    var dongList = Y.filter(function (y) { return y.dong; });
    if (!dongList.length) {
      dItems.push('静卦：六爻安静，无动爻、无变卦，变化因素少，专看用神旺衰与世应关系即可。');
    } else {
      var actTargets = [];
      var seenA = {};
      yongIdx.concat([sy.shi]).forEach(function (ix) { if (!seenA[ix]) { seenA[ix] = 1; actTargets.push(ix); } });
      dongList.forEach(function (d) {
        var parts = [desc(d) + '发动'];
        actTargets.forEach(function (tix) {
          var t = Y[tix];
          var role = tix === d.i ? '' : (yongIdx.indexOf(tix) >= 0 && tix !== sy.shi ? '用神' : (tix === sy.shi ? '世爻' : '用神'));
          if (tix === d.i) { parts.push('此爻即' + (yongIdx.indexOf(tix) >= 0 ? '用神' : '世爻') + '，自身发动'); return; }
          var r = dgRel(d.wx, t.wx);
          var rt = r === '生' ? '生' + role : r === '克' ? '克' + role : r === '被生' ? '受' + role + '生（' + role + '泄气于此）' : r === '被克' ? '为' + role + '所克' : '与' + role + '比和';
          parts.push(rt);
        });
        /* 动化：回头生克 / 化进退（先核对两端五行与地支再下名目） */
        if (d.bianZhi) {
          if (DG_JIN[d.zhi] === d.bianZhi) parts.push('化进神（' + d.zhi + '→' + d.bianZhi + '，同为' + d.wx + '、地支顺进）：传统读法为此爻之气向前递进');
          else if (DG_TUI[d.zhi] === d.bianZhi) parts.push('化退神（' + d.zhi + '→' + d.bianZhi + '，同为' + d.wx + '、地支逆退）：传统读法为此爻之气向后退却');
          else if (DG_SHENG[d.bianWx] === d.wx) parts.push('回头生（变爻' + d.bianZhi + d.bianWx + '生本爻）：传统读法为动爻得变爻回头生扶');
          else if (DG_KE[d.bianWx] === d.wx) parts.push('回头克（变爻' + d.bianZhi + d.bianWx + '克本爻）：传统读法为动爻受变爻回头克制');
          else if (DG_SHENG[d.wx] === d.bianWx) parts.push('本爻生变爻（' + d.zhi + d.wx + '→' + d.bianZhi + d.bianWx + '）：泄气化出');
          else if (d.bianWx === d.wx) parts.push('化出同五行（' + d.bianZhi + '，非进非退）');
        }
        dItems.push(parts.join('；') + '。');
      });
    }
    rows.push({ label: '动爻', items: dItems });

    /* ---- 第 5 步：特殊格局（反吟/伏吟/暗动/日破） ---- */
    var gItems = [];
    dongList.forEach(function (d) {
      if (!d.bianZhi) return;
      if (d.bianZhi === d.zhi) gItems.push(d.name + '伏吟：动而变支与本支相同（同为' + d.zhi + '，属' + (d.i < 3 ? '内卦' : '外卦') + '伏吟），传统读法为停滞、反复之象。');
      else if (DG_CHONG[d.zhi] === d.bianZhi) gItems.push(d.name + '反吟：变支' + d.bianZhi + '冲本支' + d.zhi + '，传统读法为反复、冲撞之象。');
    });
    var clashSeen = {};
    yongIdx.concat([sy.shi]).forEach(function (ix) {
      if (clashSeen[ix]) return; clashSeen[ix] = 1;
      var y = Y[ix];
      var ws = dgWangShuai(y.zhi, monthZhi, dayGz);
      var c = dgDayClash(y.zhi, y.dong, ws.score, dayGz);
      if (c) gItems.push(desc(y) + '：' + c + '。');
    });
    if (!gItems.length) gItems.push('未见反吟、伏吟；用神与世爻亦未逢日辰冲（无暗动、日破）。');
    rows.push({ label: '格局', items: gItems });

    /* ---- 第 6 步：应期候选（两书应期规则：已判状态→候选地支） ----
       《增删卜易》：静而逢值逢冲、动而逢合逢值、空者冲空实空、破者实破逢合，
       「各门各类，无不问其应期」；《卜筮正宗》：旬空待出旬/值日/冲实填补，
       月破待出月/值日/合填，伏神待月建日辰冲开飞神。
       呈现护栏（与红线一致）：只称「候选地支」，不换算公历日期、不作日期保证；
       候选只挂在已判定状态（空/破/伏/动静）上产出，不反推事之成败。 */
    var qItems = ['依《增删卜易》《卜筮正宗》应期规则推导（静逢值冲、动逢合值、空待出旬·值日·冲实、破待出月·值日·合填、伏待冲飞），以下仅为候选地支，不换算公历日期、不作日期保证。'];
    function yqLine(y, role) {
      var po = !!(monthZhi && DG_CHONG[monthZhi] === y.zhi);
      var states = [], cands = [], seenC = {};
      function addC(z, why) { if (!seenC[z]) { seenC[z] = 1; cands.push(z + '（' + why + '）'); } }
      if (y.kong) {
        states.push('逢旬空');
        addC(y.zhi, '本支：出旬、逢值填实');
        addC(DG_CHONG[y.zhi], '冲支：冲实');
      }
      if (po) {
        states.push('逢月破');
        addC(y.zhi, '本支：逢值填实');
        addC(DG_HE[y.zhi], '合支：逢合填实');
      }
      if (!y.kong && !po) {
        if (y.dong) { states.push('发动'); addC(DG_HE[y.zhi], '合支：逢合'); addC(y.zhi, '本支：逢值'); }
        else { states.push('安静'); addC(y.zhi, '本支：逢值'); addC(DG_CHONG[y.zhi], '冲支：逢冲'); }
      }
      var s = role + '：' + desc(y) + '，状态为' + states.join('、') + '，候选地支为 ' + cands.join('、') + '。';
      if (po) s += '月破者，另须待出月之后。';
      return s;
    }
    if (fuYong) {
      var feiY = Y[fuYong.fu.pos];
      qItems.push(fuYong.role + '「' + fuYong.fu.qin + '」伏藏：伏神 ' + fuYong.fu.qin + fuYong.fu.gan + fuYong.fu.zhi
        + ' 伏于' + feiY.name + '飞神（' + feiY.qin + feiY.gan + feiY.zhi + '）之下，出伏候选地支为 '
        + DG_CHONG[feiY.zhi] + '（冲开飞神之支）、' + fuYong.fu.zhi + '（伏神逢值之支）。');
    }
    // 锚点：已判用神（含伏神，已在上行）优先；未选事类、或用神全不见且无伏神时，才以世爻为锚
    var qIdx = yongIdx.length ? yongIdx : (fuYong ? [] : [sy.shi]);
    var seenQ = {};
    qIdx.forEach(function (ix) {
      if (seenQ[ix]) return; seenQ[ix] = 1;
      qItems.push(yqLine(Y[ix], yongIdx.length ? (yongRole[ix] || '用神') : '世爻'));
    });
    rows.push({ label: '应期', items: qItems });

    return { rows: rows, topic: topic, topicLabel: topicLabel(topic), yongIdx: yongIdx };
  }
  function dgEsc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function duanCardHtml(dg) {
    var h = '<div class="ly-duan" id="ly-duan"><div class="ly-duan-title">卦象判读</div>';
    dg.rows.forEach(function (r) {
      h += '<div class="ly-duan-row"><span class="ly-duan-label">' + dgEsc(r.label) + '</span><div class="ly-duan-body">'
        + r.items.map(function (it) { return '<div>' + dgEsc(it) + '</div>'; }).join('') + '</div></div>';
    });
    h += '<div class="ly-duan-foot">以上为卦象结构判读，供文化研究参考，不作吉凶断语。</div></div>';
    return h;
  }
  /* 对外（含回归测试）：给定爻象、日期、事类直接算判读 */
  function duanFor(linesArr, date, topic, gender) {
    var info = { monthZhi: '', dayGz: '', dayGan: '甲', xk: '', date: date || null };
    try {
      if (window.Lunar) {
        var l = window.Lunar.fromDate(date);
        info.monthZhi = l.getMonthZhi();
        info.dayGz = l.getDayGan() + l.getDayZhi();
        info.dayGan = l.getDayGan();
        info.xk = xunkong(info.dayGz);
      }
    } catch (e) {}
    return computeDuan(linesArr, info, topic || '', gender || 'm');
  }
  /* 纳甲流派单选回填（保存值/默认流派1；照八字 bz-sect 同例） */
  function syncLySectUI() {
    document.querySelectorAll('input[name="ly-sect"]').forEach(function (r) { r.checked = (+r.value === lySect); });
  }
  function syncTopicUI() {
    var ts = $('ly-topic-sel'); if (ts) ts.value = lyTopic.cat;
    var gs = $('ly-gender-sel'); if (gs) gs.value = lyTopic.gender;
    var gw = $('ly-gender-wrap'); if (gw) gw.hidden = lyTopic.cat !== 'hun';
    var hs = $('ly-cat-sel'); if (hs && hs.value !== lyTopic.cat) hs.value = lyTopic.cat;
  }
  function refreshDuanIfShown() {
    var rc = $('ly-result-card');
    if (rc && !rc.hidden && lines.length === 6) renderResult(true);
  }

  // 互卦/错卦/综卦名
  function huGua(key) {
    // 互卦：2-3-4为下，3-4-5为上（key是下爻在前，索引0=初爻）
    var lower = key[1] + key[2] + key[3]; // 二三四爻
    var upper = key[2] + key[3] + key[4]; // 三四五爻
    return lower + upper;
  }
  function cuoGua(key) { return key.split('').map(function (c) { return c === '1' ? '0' : '1'; }).join(''); }
  function zongGua(key) { return key.split('').reverse().join(''); }

  var lines = [];  // 已摇出的爻，自下而上：{yao: 0/1, dong: bool, coins: [h,h,h]}
  var shaking = false;
  var castTime = null;   // 起卦时间（时间字段指定，null=此刻）；摇卦/手动共用，装卦/历史/AI 文本同一口径
  var lyMode = 'shake';  // 'shake' | 'manual'
  var mEditIdx = 0;      // 手动录入当前编辑的爻位（自下而上 0-5；等于 lines.length 表示追加下一爻）
  function effNow() { return castTime ? new Date(castTime.getTime()) : new Date(); }
  /* 铜钱→爻的唯一口径（摇卦与手动录入共用此函数，保证两路产出一致）。
     coins 取值：0=字, 1=花(背)；按花（背）数定爻，宗《增删卜易》〈占卦法〉与
     《卜筮正宗》〈以钱代蓍法〉四格定法（背值 3、字值 2，值和即 9/8/7/6）：
     3 花→重·老阳(阳·动)  2 花→拆·少阴(阴·静)  1 花→单·少阳(阳·静)  0 花→交·老阴(阴·动)。
     2026-10-26 修正：此前中间两档误作「2 花少阳、1 花少阴」（近现代从多定性支），
     与两书相反，静爻阴阳构成随之偏离；极值两档向来无误，不动。 */
  function coinResult(coins) {
    var yang = coins[0] + coins[1] + coins[2];
    var yao, dong = false;
    if (yang === 3) { yao = 1; dong = true; }       // 重·老阳 ○
    else if (yang === 0) { yao = 0; dong = true; }  // 交·老阴 ×
    else if (yang === 2) { yao = 0; }               // 拆·少阴 --
    else { yao = 1; }                              // 单·少阳 —
    return { yao: yao, dong: dong, coins: coins };
  }

  function $(id) { return document.getElementById(id); }

  /* 摇一次：三枚铜钱（真随机：crypto.getRandomValues，降级Math.random） */
  function randBit() {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        var a = new Uint32Array(1);
        window.crypto.getRandomValues(a);
        return a[0] % 2;
      }
    } catch (e) {}
    return Math.random() < 0.5 ? 0 : 1;
  }
  function throwCoins() {
    var coins = [];
    for (var i = 0; i < 3; i++) {
      coins.push(randBit());  // 0=字(阴), 1=花(阳)
    }
    return coinResult(coins);
  }

  function guaKey(ls) {
    return ls.map(function (l) { return l.yao; }).join('');
  }

  function renderCoins(coins) {
    var box = $('ly-coins');
    if (!box) return;
    box.innerHTML = '';
    coins.forEach(function (c, i) {
      var d = document.createElement('div');
      // c=1阳=背面(无字), c=0阴=字面(开元通宝)
      d.className = 'ly-coin show';
      d.style.backgroundImage = "url('img/liuyao/" + (c === 1 ? 'coin-back.png' : 'coin.png') + "')";
      d.style.animationDelay = (i * 0.15) + 's';
      box.appendChild(d);
    });
  }

  function renderLines() {
    var box = $('ly-lines');
    if (!box) return;
    box.innerHTML = '';
    // 自上而下显示（第六爻在上）。固定几何（2026-10-22 对齐根治）：每行 = 条宽槽 104px
    // （阳爻整条 104、阴爻 49+6+49）＋动标记固定列 20px，动/静/虚线行同宽同位，不再随标记有无漂移。
    for (var i = lines.length - 1; i >= 0; i--) {
      var l = lines[i];
      var d = document.createElement('div');
      d.className = 'ly-line ' + (l.yao === 1 ? 'yang' : 'yin') + (l.dong ? ' dong' : '');
      var bars = l.yao === 1
        ? '<span class="ly-bar"></span>'
        : '<span class="ly-bar left"></span><span class="ly-bar right"></span>';
      var mk = l.dong ? (l.yao === 1 ? '○' : '×') : '';
      d.innerHTML = '<span class="ly-barwrap">' + bars + '</span><span class="ly-dong">' + mk + '</span>';
      box.appendChild(d);
    }
    // 未摇出的爻显示虚线
    for (var j = lines.length; j < 6; j++) {
      var e = document.createElement('div');
      e.className = 'ly-line empty';
      e.innerHTML = '<span class="ly-barwrap"><span class="ly-bar ghost"></span></span><span class="ly-dong"></span>';
      box.insertBefore(e, box.firstChild);
    }
  }

  function saveHistory(guaName, bianName) {
    try {
      var q = $('ly-question-input');
      var rec = {
        time: effNow().toISOString(),
        src: lyMode,
        sect: lySect,
        question: q ? q.value.trim() : '',
        gua: guaName,
        bian: bianName || '',
        // 存原始铜钱：口径若再修正，历史盘可按新映射重算（2026-10-26 起）
        lines: lines.map(function (l) { return { yao: l.yao, dong: l.dong, coins: (l.coins && l.coins.length === 3) ? l.coins.slice() : null }; })
      };
      var h = JSON.parse(localStorage.getItem('ly_history') || '[]');
      h.unshift(rec);
      if (h.length > 300) {
        h = h.slice(0, 300);
        try {
          if (!localStorage.getItem('ly_history_full_warned')) {
            localStorage.setItem('ly_history_full_warned', '1');
            setTimeout(function () { WuriDlg.alert('占卜历史已满300条，新记录将覆盖最早的记录。'); }, 500);
          }
        } catch (e) {}
      }
      localStorage.setItem('ly_history', JSON.stringify(h));
    } catch (e) {}
  }

  function renderResult(skipSave) {
    if (lines.length < 6) return;
    var key = guaKey(lines);
    var g = GUA[key];
    $('ly-result-card').hidden = false;
    // 占问/归档/时间头（照专业 App）
    try {
      var zhanwen = '';
      try { zhanwen = localStorage.getItem('wuri_ly_zhanwen') || ''; } catch (e) {}
      var now = effNow();
      var weekStr = '日一二三四五六'[now.getDay()];
      var timeStr = '公历:' + now.getFullYear() + '年' + (now.getMonth()+1) + '月' + now.getDate() + '日 '
        + now.getHours() + '时' + now.getMinutes() + '分 <nobr>星期' + weekStr + '</nobr>';
      var lunarStr = '';
      try {
        if (window.Lunar) {
          var l = window.Lunar.fromDate(now);
          lunarStr = '<br>农历:' + l.getYearInChinese() + '年' + l.getMonthInChinese() + '月' + l.getDayInChinese();
        }
      } catch (e) {}
      var curCat = topicLabel(lyTopic.cat);
      var catOpts = LY_TOPICS.map(function (o) {
        return '<option value="' + o.k + '"' + (o.k === lyTopic.cat ? ' selected' : '') + '>' + o.label + '</option>';
      }).join('');
      var headerHtml = '<div class="ly-head-pro">'
        + '<div class="ly-head-row"><span class="ly-head-label">占问</span><span class="ly-head-val" id="ly-zhanwen-disp" style="cursor:pointer">' + (zhanwen ? escHtml(zhanwen) : '点击此处编辑占问事由') + '</span></div>'
        + '<div class="ly-head-row"><span class="ly-head-label">分类</span><select id="ly-cat-sel" class="ly-cat-sel">' + catOpts + '</select></div>'
        + '<div class="ly-head-row"><span class="ly-head-label">归档</span><span class="ly-head-val" id="ly-cat-disp">' + curCat + '</span></div>'
        + '<div class="ly-head-row"><span class="ly-head-label">时间</span><span class="ly-head-val">' + timeStr + lunarStr + '</span></div>'
        + '</div>';
      var detail = $('ly-yao-detail');
      // 分类选择事件（与起卦区「所问之事」同一状态；改事类即重算判读，只绑一次防重复）
      setTimeout(function () {
        var sel = $('ly-cat-sel');
        if (sel && !sel._lyBound) {
          sel._lyBound = true;
          sel.addEventListener('change', function () {
            lyTopic.cat = this.value;
            saveTopic();
            syncTopicUI();
            var d = $('ly-cat-disp');
            if (d) d.textContent = topicLabel(lyTopic.cat);
            renderResult(true);
          });
        }
        /* 占问事由编辑：原内联 onclick 的原生 prompt 换自有弹窗（点一次绑一次） */
        var zw = $('ly-zhanwen-disp');
        if (zw && !zw._lyBound) {
          zw._lyBound = true;
          zw.addEventListener('click', function () {
            var cur = '';
            try { cur = localStorage.getItem('wuri_ly_zhanwen') || ''; } catch (e) {}
            WuriDlg.prompt('占问事由', cur, '保存').then(function (v) {
              if (v === null) return;
              try { localStorage.setItem('wuri_ly_zhanwen', v); } catch (e) {}
              zw.textContent = v || '点击此处编辑占问事由';
            });
          });
        }
      }, 100);

      // 把 header 插到 detail 前面
      if (detail && !$('ly-head-pro-inserted')) {
        var tmp = document.createElement('div');
        tmp.innerHTML = headerHtml;
        tmp.id = 'ly-head-pro-inserted';
        detail.parentNode.insertBefore(tmp, detail);
      }
    } catch (e) {}
    // escHtml helper
    function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    // 变卦
    var hasDong = lines.some(function (l) { return l.dong; });
    // 爻位详情：紧凑装卦表（六兽|六亲|干支|爻|世应|变爻）
    var detail = $('ly-yao-detail');
    var names = ['初', '二', '三', '四', '五', '上'];
    var gong = getGong(key);
    var sy = getShiYing(key);
    var lyDate = effNow();   // 起卦时间：纳甲流派二老时迁的遁期判定与历法同源
    var nj = najia(key, lyDate);
    // 日辰：用当前日期的干支（lunar-javascript）
    var dayGz = '', dayGan = '甲', monthZhi = '';
    try {
      if (window.Lunar) {
        var now = effNow();
        var l = window.Lunar.fromDate(now);
        dayGz = l.getDayGan() + l.getDayZhi();
        dayGan = l.getDayGan();
        monthZhi = l.getMonthZhi();
      }
    } catch (e) {}
    var xk = dayGz ? xunkong(dayGz) : '';
    var beasts = liushou(dayGan);
    // 四柱（带五行颜色）
    var sizhu = ['', '', '', ''];
    var sizhuHtml = '';
    try {
      if (window.Lunar) {
        var now = effNow();
        var l = window.Lunar.fromDate(now);
        sizhu = [l.getYearGan() + l.getYearZhi(), l.getMonthGan() + l.getMonthZhi(), l.getDayGan() + l.getDayZhi(), l.getTimeGan() + l.getTimeZhi()];
        var wxC = {'金':'#b8860b','木':'#2e8b57','水':'#4169e1','火':'#dc143c','土':'#8b6914'};
        var gWx = {'甲':'木','乙':'木','丙':'火','丁':'火','戊':'土','己':'土','庚':'金','辛':'金','壬':'水','癸':'水'};
        var zWx = {'子':'水','丑':'土','寅':'木','卯':'木','辰':'土','巳':'火','午':'火','未':'土','申':'金','酉':'金','戌':'土','亥':'水'};
        sizhuHtml = sizhu.map(function (gz) {
          if (!gz) return '';
          var g = gz[0], z = gz[1];
          return '<span style="color:' + (wxC[gWx[g]]||'#333') + '">' + g + '</span><span style="color:' + (wxC[zWx[z]]||'#333') + '">' + z + '</span>';
        }).join(' ');
      }
    } catch (e) {}
    // 伏神：本宫首卦中缺的六亲
    var fuShen = ['', '', '', '', '', ''];
    try {
      var pureKey = null;
      for (var bi = 0; bi < BAGONG.length; bi++) {
        if (BAGONG[bi][0] === gong.name) { pureKey = BAGONG[bi][2][0]; break; }
      }
      if (pureKey) {
        var pureNj = najia(pureKey, lyDate);
        var curQin = {};
        for (var ci = 0; ci < 6; ci++) curQin[liuqin(gong.wx, ZHI_WX[nj[ci].zhi])] = 1;
        for (var fi = 0; fi < 6; fi++) {
          var fq = liuqin(gong.wx, ZHI_WX[pureNj[fi].zhi]);
          if (!curQin[fq]) fuShen[fi] = fq + pureNj[fi].gan + pureNj[fi].zhi;
        }
      }
    } catch (e) {}
    // 变卦信息
    var bianLines = hasDong ? lines.map(function (l) { return { yao: l.dong ? (1 - l.yao) : l.yao }; }) : null;
    var bianKey = hasDong ? guaKey(bianLines) : null;
    var bianG = hasDong ? GUA[bianKey] : null;
    var bianNj = hasDong ? najia(bianKey, lyDate) : null;
    var bianGong = hasDong ? getGong(bianKey) : null;
    var bianSy = hasDong ? getShiYing(bianKey) : null;
    // 标题：四柱+旬空
    // 四柱 HTML：直接用 sizhuHtml（已经是4组，空格分隔），不用 split
    var szSpans = ['', '', '', '', ''];
    try {
      if (window.Lunar) {
        var now2 = effNow();
        var l2 = window.Lunar.fromDate(now2);
        var gzs = [l2.getYearGan()+l2.getYearZhi(), l2.getMonthGan()+l2.getMonthZhi(), l2.getDayGan()+l2.getDayZhi(), l2.getTimeGan()+l2.getTimeZhi()];
        var wxC2 = {'金':'#b8860b','木':'#2e8b57','水':'#4169e1','火':'#dc143c','土':'#8b6914'};
        var gWx2 = {'甲':'木','乙':'木','丙':'火','丁':'火','戊':'土','己':'土','庚':'金','辛':'金','壬':'水','癸':'水'};
        var zWx2 = {'子':'水','丑':'土','寅':'木','卯':'木','辰':'土','巳':'火','午':'火','未':'土','申':'金','酉':'金','戌':'土','亥':'水'};
        for (var si = 0; si < 4; si++) {
          var gz = gzs[si];
          var gg = gz[0], zz = gz[1];
          szSpans[si] = '<span style="color:' + (wxC2[gWx2[gg]]||'#333') + '">' + gg + '</span><span style="color:' + (wxC2[zWx2[zz]]||'#333') + '">' + zz + '</span>';
        }
      }
    } catch (e) {}
    var html = '<div class="ly-sizhu"><span class="ly-sz-label">四柱</span>'
      + '<span>年柱<br>' + szSpans[0] + '</span><span>月柱<br>' + szSpans[1] + '</span>'
      + '<span>日柱<br>' + szSpans[2] + '</span><span>时柱<br>' + szSpans[3] + '</span>'
      + '<span>旬空<br>' + (xk || '') + '</span></div>';
    // 本卦/变卦名
    // 变卦名：无动爻时显示本卦名
    // 变卦只标卦名，不标变宫（两书：变卦不另安世应、六亲照本卦推，宫名标注亦不取）
    var bianName = (hasDong && bianG) ? bianG[0] : (g ? g[0] + '(' + gong.name + ')' : '?');
    html += '<div class="ly-gua-names"><div class="ly-gua-name-l">' + (g ? g[0] : '?') + '(' + gong.name + ')</div>'
      + '<div class="ly-gua-name-r">' + bianName + '</div></div>';
    // 主表：六神|伏神|本卦|变卦
    // === 像素级：照专业盘（无伏神独立列，伏神跟六神同行）===
    function yaoBar3(isYang) {
      if (isYang) return '<i class="lyx-y"></i>';
      return '<i class="lyx-n"></i><i class="lyx-n"></i>';
    }
    html += '<table class="lyx"><tr><th>六神</th><th>本卦</th><th>变卦</th></tr>';
    for (var i = 5; i >= 0; i--) {
      var l = lines[i];
      var yaoWx = ZHI_WX[nj[i].zhi];
      var qinFull = liuqin(gong.wx, yaoWx);
      var qin = {'官鬼':'官','父母':'父','兄弟':'兄','妻财':'财','子孙':'孙'}[qinFull] || qinFull;
      var isKong = xk && xk.indexOf(nj[i].zhi) >= 0;
      var info = qin + ' ' + nj[i].gan + nj[i].zhi + (isKong ? '<sup>空</sup>' : '');
      var bar = yaoBar3(l.yao === 1);
      var dong = l.dong ? (l.yao === 1 ? '<b class="lyx-d">○</b>' : '<b class="lyx-d">×</b>') : '';
      var syMark = '';
      if (i === sy.shi) syMark = ' 世';
      else if (i === sy.ying) syMark = ' 应';
      // 六神+伏神：伏神改列于六神下方（固定列宽网格的宽度预算所限，2026-10-22 对齐根治）
      var shenFu = beasts[i] + (fuShen[i] ? '<br><span class="ly-fushen">' + fuShen[i] + '</span>' : '');
      // 变卦：六亲照本卦宫五行推（《增删卜易》「变出之爻安六亲者仍照正卦而推」），
      // 变卦不另安世应——只列变爻本身，世应唯在本卦
      var bInfo = info, bBar = yaoBar3(l.yao === 1), bSY = '';
      if (hasDong && bianNj) {
        var bWx = ZHI_WX[bianNj[i].zhi];
        var bQinFull = liuqin(gong.wx, bWx);
        var bQin = {'官鬼':'官','父母':'父','兄弟':'兄','妻财':'财','子孙':'孙'}[bQinFull] || bQinFull;
        bInfo = bQin + ' ' + bianNj[i].gan + bianNj[i].zhi;
        bBar = yaoBar3(bianLines[i].yao === 1);
      }
      var mark = '<span class="lyx-mark">' + dong + (syMark ? '<span class="lyx-sy">' + syMark.trim() + '</span>' : '') + '</span>';
      var bMark = '<span class="lyx-mark">' + (bSY ? '<span class="lyx-sy">' + bSY.trim() + '</span>' : '') + '</span>';
      html += '<tr' + (l.dong ? ' class="lyx-mv"' : '') + '>'
        + '<td class="lyx-shen">' + shenFu + '</td>'
        + '<td><span class="lyx-flex"><span class="lyx-info">' + info + '</span><span class="lyx-bar">' + bar + '</span>' + mark + '</span></td>'
        + '<td><span class="lyx-flex"><span class="lyx-info">' + bInfo + '</span><span class="lyx-bar">' + bBar + '</span>' + bMark + '</span></td></tr>';
    }
    html += '</table>';
    // 互卦/错卦/综卦
    var hg = GUA[huGua(key)], cg = GUA[cuoGua(key)], zg = GUA[zongGua(key)];
    html += '<div class="ly-hcz">互卦：' + (hg ? hg[0] : '?') + '　错卦：' + (cg ? cg[0] : '?') + '　综卦：' + (zg ? zg[0] : '?') + '</div>';
    // 断卦层：卦象判读卡（结构判读引擎，与 AI 文本同一口径）
    try {
      var dgRes = computeDuan(lines, { monthZhi: monthZhi, dayGz: dayGz, dayGan: dayGan, xk: xk, date: lyDate }, lyTopic.cat, lyTopic.gender);
      html += duanCardHtml(dgRes);
    } catch (e) {}
    detail.innerHTML = html;
    var zwInput = $('ly-zhanwen-input');
    if (zwInput) zwInput.addEventListener('change', function () {
      try { localStorage.setItem('wuri_ly_zhanwen', this.value); } catch (e) {}
    });
    // 保存历史（查看历史时跳过，避免重复新增）
    if (!skipSave) {
      var bianName = '';
      if (hasDong) {
        var bk = guaKey(lines.map(function (l) { return { yao: l.dong ? (1 - l.yao) : l.yao }; }));
        var bbg = GUA[bk];
        if (bbg) bianName = bbg[0];
      }
      saveHistory(g ? g[0] : '', bianName);
    }
    renderHistory();
  }

  function shakeOne() {
    if (lyMode === 'manual') return;
    if (shaking || lines.length >= 6) return;
    shaking = true;
    var tortoise = $('ly-tortoise');
    var status = $('ly-status');
    // 龟壳摇晃动画
    if (tortoise) {
      tortoise.classList.remove('shaking');
      void tortoise.offsetWidth;
      tortoise.classList.add('shaking');
    }
    if (status) status.textContent = '摇晃龟壳…';
    // 清空旧铜钱
    var box = $('ly-coins');
    if (box) box.innerHTML = '';
    setTimeout(function () {
      var r = throwCoins();
      lines.push(r);
      renderCoins(r.coins);
      renderLines();
      var names = ['初', '二', '三', '四', '五', '上'];
      if (status) {
        status.textContent = '第' + names[lines.length - 1] + '爻：' +
          (r.yao === 1 ? '阳' : '阴') + (r.dong ? '（动爻）' : '');
      }
      if (tortoise) tortoise.classList.remove('shaking');
      shaking = false;
      if (lines.length === 6) {
        if (status) status.textContent = '六爻已成！';
        setTimeout(renderResult, 600);
      }
    }, 900);
  }

  /* 一键出六爻：摇一次龟壳，直接显示完整卦 */
  function shakeAllAtOnce() {
    if (lyMode === 'manual') return;
    if (shaking) return;
    shaking = true;
    lines = [];
    $('ly-result-card').hidden = true;
    var tortoise = $('ly-tortoise');
    var status = $('ly-status');
    var box = $('ly-coins');
    if (tortoise) {
      tortoise.classList.remove('shaking');
      void tortoise.offsetWidth;
      tortoise.classList.add('shaking');
    }
    if (status) status.textContent = '摇晃龟壳…';
    if (box) box.innerHTML = '';
    setTimeout(function () {
      // 只摇一次铜钱做示意
      var r = throwCoins();
      renderCoins(r.coins);
      // 直接生成六爻
      for (var i = 0; i < 6; i++) {
        lines.push(throwCoins());
      }
      renderLines();
      if (status) status.textContent = '六爻已成！';
      if (tortoise) tortoise.classList.remove('shaking');
      shaking = false;
      setTimeout(renderResult, 600);
    }, 900);
  }

  /* 旧版逐爻摇（保留备用） */
  function shakeAll() {
    if (shaking) return;
    lines = [];
    $('ly-result-card').hidden = true;
    var i = 0;
    function next() {
      if (i >= 6) return;
      shakeOne();
      i++;
      var check = setInterval(function () {
        if (!shaking) {
          clearInterval(check);
          setTimeout(next, 300);
        }
      }, 100);
    }
    next();
  }

  /* ---------- 起卦时间字段（摇卦/手动共用） ---------- */
  function fmtLocal(d) {
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function setCastTime(d, syncInput) {
    castTime = d || null;
    if (syncInput) { var inp = $('ly-dt'); if (inp) inp.value = d ? fmtLocal(d) : ''; }
  }

  /* ---------- 手动录入 ---------- */
  var M_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
  function setMode(m) {
    lyMode = m;
    var bS = $('ly-mode-shake'), bM = $('ly-mode-manual');
    if (bS) bS.classList.toggle('on', m === 'shake');
    if (bM) bM.classList.toggle('on', m === 'manual');
    var stage = $('ly-stage'), btns = $('ly-shake-btns'), man = $('ly-manual');
    if (stage) stage.hidden = (m === 'manual');
    if (btns) btns.hidden = (m === 'manual');
    if (man) man.hidden = (m === 'shake');
    if (m === 'manual') { renderLines(); bindPreviewClicks(); updateManualUI(); }
    else {
      var st = $('ly-status');
      if (st && !lines.length) st.textContent = '摇一摇手机，或点下方按钮开始';
    }
  }
  function updateManualUI() {
    var t = $('ly-m-title');
    if (t) {
      if (mEditIdx < lines.length) t.textContent = '重选第 ' + (mEditIdx + 1) + ' 爻（共 6 爻）· ' + M_NAMES[mEditIdx];
      else if (lines.length < 6) t.textContent = '第 ' + (lines.length + 1) + ' 爻（共 6 爻）· ' + M_NAMES[lines.length];
      else t.textContent = '六爻已录满（共 6 爻）· 点下方爻象可重选';
    }
    var cast = $('ly-m-cast'); if (cast) cast.disabled = lines.length < 6;
    var back = $('ly-m-back'); if (back) back.disabled = !lines.length;
    var st = $('ly-status');
    if (st && lyMode === 'manual') st.textContent = lines.length >= 6 ? '六爻已成！点「生成卦象」排盘' : ('已录 ' + lines.length + ' / 6 爻');
    var box = $('ly-lines');
    if (box) {
      var filled = box.querySelectorAll('.ly-line:not(.empty)');
      filled.forEach(function (el, di) {
        el.classList.toggle('editing', (lines.length - 1 - di) === mEditIdx);
      });
    }
  }
  function bindPreviewClicks() {
    var box = $('ly-lines');
    if (!box) return;
    box.querySelectorAll('.ly-line:not(.empty)').forEach(function (el, di) {
      el.addEventListener('click', function () {
        mEditIdx = lines.length - 1 - di;
        updateManualUI();
      });
    });
  }
  function manualPick(coins) {
    if (shaking) return;
    var entry = coinResult(coins.slice());
    if (mEditIdx < lines.length) lines[mEditIdx] = entry;
    else if (lines.length < 6) lines.push(entry);
    else return;
    mEditIdx = lines.length;
    renderLines();
    bindPreviewClicks();
    updateManualUI();
  }
  function manualBack() {
    if (!lines.length) return;
    lines.pop();
    mEditIdx = lines.length;
    $('ly-result-card').hidden = true;
    renderLines();
    bindPreviewClicks();
    updateManualUI();
  }
  function manualClear() {
    lines = [];
    mEditIdx = 0;
    $('ly-result-card').hidden = true;
    renderLines();
    bindPreviewClicks();
    updateManualUI();
  }
  function manualCast() {
    if (lines.length < 6) return;
    renderResult(false);
    var rc = $('ly-result-card');
    if (rc) rc.scrollIntoView({ behavior: 'smooth' });
  }

  function reset() {
    lines = [];
    shaking = false;
    mEditIdx = 0;
    $('ly-coins').innerHTML = '';
    $('ly-result-card').hidden = true;
    $('ly-status').textContent = '摇一摇手机，或点下方按钮开始';
    renderLines();
    if (lyMode === 'manual') { bindPreviewClicks(); updateManualUI(); }
  }

  function open() {
    $('view-liuyao').hidden = false;
    // 确保主题生效（用户 2026-10-09 反馈：暗色主题下六爻页有时还是亮的）
    try { if (typeof applyTheme === 'function') applyTheme(); } catch (e) {}
    if (typeof updateFloatingButtons === 'function') updateFloatingButtons();
    // 隐藏其他view
    ['view-bazi', 'view-practice'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    // 隐藏tab
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    setCastTime(new Date(), true);
    reset();
    setMode('shake');
    loadTopic();
    syncTopicUI();
    renderHistory();
    bindShake();
  }

  function close() {
    $('view-liuyao').hidden = true;
    if (typeof updateFloatingButtons === 'function') updateFloatingButtons();
    document.getElementById('tab-home').classList.add('active');
    if (window._lyShakeHandler) {
      window.removeEventListener('devicemotion', window._lyShakeHandler);
      window._lyShakeHandler = null;
    }
  }

  function bindShake() {
    // 手机摇一摇
    if (window._lyShakeHandler) return;
    var lastX = 0, lastY = 0, lastZ = 0, lastTime = 0;
    var handler = function (e) {
      var acc = e.accelerationIncludingGravity;
      if (!acc) return;
      var now = Date.now();
      if (now - lastTime < 300) return;
      var dx = Math.abs(acc.x - lastX), dy = Math.abs(acc.y - lastY), dz = Math.abs(acc.z - lastZ);
      if ((dx + dy + dz) > 45) {
        lastTime = now;
        shakeOne();
      }
      lastX = acc.x; lastY = acc.y; lastZ = acc.z;
    };
    window._lyShakeHandler = handler;
    // iOS 13+ 必须先请求动作权限，且必须在用户手势中调用（2026-10-10）
    // bindShake 由六爻页面入口点击触发，属于用户手势，满足条件
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        DeviceMotionEvent.requestPermission().then(function (state) {
          if (state === 'granted') {
            window.addEventListener('devicemotion', handler);
          } else {
            window._lyShakeHandler = null; // 拒绝后允许下次重试
          }
        }).catch(function () { window._lyShakeHandler = null; });
      } catch (e) { window._lyShakeHandler = null; }
    } else {
      window.addEventListener('devicemotion', handler);
    }
  }

  function renderHistory() {
    var box = $('ly-history-list');
    if (!box) return;
    var h = [];
    try { h = JSON.parse(localStorage.getItem('ly_history') || '[]'); } catch (e) {}
    var cnt = $('ly-history-count');
    if (cnt) cnt.textContent = h.length ? '（' + h.length + '条' + (h.length >= 300 ? '，已满' : '') + '）' : '';
    if (!h.length) {
      box.innerHTML = '<div class="ly-history-empty">暂无历史记录</div>';
      return;
    }
    var html = '';
    h.forEach(function (r, i) {
      var d = new Date(r.time);
      var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0') + ' ' +
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      html += '<div class="ly-history-item" data-idx="' + i + '"><div class="ly-history-top"><span class="ly-history-gua">' +
        r.gua + '卦' + (r.bian ? ' → ' + r.bian + '卦' : '') + (r.src === 'manual' ? '<span class="ly-history-src">手动录入</span>' : '') + '</span><span class="ly-history-time">' + ds + '</span></div>' +
        (r.question ? '<div class="ly-history-q">' + r.question.replace(/</g, '&lt;') + '</div>' : '') + '</div>';
    });
    box.innerHTML = html;
    // 点击查看
    box.querySelectorAll('.ly-history-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var r = h[parseInt(el.getAttribute('data-idx'), 10)];
        if (!r || !r.lines) return;
        // 有原始铜钱的记录按现行 coinResult 口径重算；旧记录无 coins，只能按存档爻值呈现
        lines = r.lines.map(function (l) {
          if (l.coins && l.coins.length === 3) return coinResult(l.coins.slice());
          return { yao: l.yao, dong: l.dong, coins: [] };
        });
        /* 手动记录按其所填时间回放，保证与原盘一致；旧/摇卦记录维持原口径（当前时间）。
         * 手动记录同时恢复其起卦时的纳甲流派（仅页面内状态＋单选回填，不改写已保存的默认流派；
         * 无 sect 字段的旧记录起卦时只有流派一，按流派一回放） */
        if (r.src === 'manual' && r.time) { setCastTime(new Date(r.time), true); lySect = (r.sect === 2) ? 2 : 1; syncLySectUI(); }
        else setCastTime(null, true);
        renderLines();
        renderResult(true);
        document.getElementById('ly-result-card').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  function init() {
    var enter = $('liuyao-enter');
    if (enter) enter.addEventListener('click', function () {
      if (window.WuriPro && !WuriPro.isPro()) { WuriPro.requirePro('liuyao'); return; }
      open();
    });
    var back = $('liuyao-back');
    if (back) back.addEventListener('click', close);
    var all = $('ly-shake-all');
    if (all) all.addEventListener('click', shakeAllAtOnce);
    var rs = $('ly-reset');
    if (rs) rs.addEventListener('click', reset);
    /* 模式切换 / 起卦时间 / 手动录入（2026-10-22 新功能） */
    var mS = $('ly-mode-shake'), mM = $('ly-mode-manual');
    if (mS) mS.addEventListener('click', function () { setMode('shake'); });
    if (mM) mM.addEventListener('click', function () { setMode('manual'); });
    var dt = $('ly-dt');
    if (dt) dt.addEventListener('change', function () {
      castTime = this.value ? new Date(this.value) : null;
    });
    var dtn = $('ly-dt-now');
    if (dtn) dtn.addEventListener('click', function () { setCastTime(new Date(), true); });
    document.querySelectorAll('.ly-m-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var coins = b.getAttribute('data-coins').split(',').map(function (x) { return parseInt(x, 10); });
        manualPick(coins);
      });
    });
    var mBack = $('ly-m-back'); if (mBack) mBack.addEventListener('click', manualBack);
    var mClear = $('ly-m-clear'); if (mClear) mClear.addEventListener('click', manualClear);
    var mCast = $('ly-m-cast'); if (mCast) mCast.addEventListener('click', manualCast);
    /* 所问之事（事类）＋婚恋性别：与结果头分类同一状态，改动即重算判读 */
    var tSel = $('ly-topic-sel');
    if (tSel) tSel.addEventListener('change', function () {
      lyTopic.cat = this.value;
      saveTopic();
      syncTopicUI();
      refreshDuanIfShown();
    });
    var gSel = $('ly-gender-sel');
    if (gSel) gSel.addEventListener('change', function () {
      lyTopic.gender = this.value;
      saveTopic();
      refreshDuanIfShown();
    });
    syncTopicUI();
    /* 纳甲流派（流派一京房固定／流派二二老时迁）：回填保存值，切换即存并整盘重排 */
    syncLySectUI();
    document.querySelectorAll('input[name="ly-sect"]').forEach(function (r) {
      r.addEventListener('change', function () {
        if (!r.checked) return;
        lySect = +r.value;
        try { localStorage.setItem('wuri_ly_sect', String(lySect)); } catch (e) {}
        refreshDuanIfShown();
      });
    });
    /* iOS 摇一摇权限按钮：必须在用户直接点击中申请（2026-10-10 fix #5） */
    var mp = $('ly-motion-perm');
    if (mp) {
      /* 只在需要权限的 iOS 上显示 */
      var needPerm = (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function');
      mp.hidden = !needPerm;
      if (needPerm) {
        mp.addEventListener('click', function () {
          DeviceMotionEvent.requestPermission().then(function (state) {
            if (state === 'granted') {
              mp.hidden = true;
              bindShake();
              $('ly-status').textContent = '已启用摇一摇，摇动手机起卦';
            } else {
              $('ly-status').textContent = '未获得动作权限，可用下方按钮手动起卦';
            }
          }).catch(function () {
            $('ly-status').textContent = '权限申请失败，可用下方按钮手动起卦';
          });
        });
      }
    }
    renderLines();
  }

  function buildChartText() {
    if (lines.length < 6) return;
    var key = guaKey(lines);
    var g = GUA[key];
    var gong = getGong(key);
    var zhanwen = '';
    try { zhanwen = localStorage.getItem('wuri_ly_zhanwen') || ''; } catch (e) {}
    var cat = topicLabel(lyTopic.cat) + (lyTopic.cat === 'hun' ? '（' + (lyTopic.gender === 'f' ? '女问' : '男问') + '）' : '');
    /* 事类→参考用神（通行取法，仅作提示，断卦时仍须结合所问事由确认） */
    var CAT_YONGSHEN = {
      '': '未选择事类，请按所问事由自取用神，并说明取用理由',
      'cai': '妻财为用（所求之财），子孙为财源，兄弟为劫财',
      'shi': '官鬼为用（工作、职位、上级），兼看父母（文书、合同）',
      'hun': lyTopic.gender === 'f' ? '官鬼为用（所问的男方），兼看世应关系' : '妻财为用（所问的女方），兼看世应关系',
      'jian': '官鬼为病症、子孙为医药，世爻为自身（仅作结构解读，不作医疗判断）',
      'xing': '世爻为自身、应爻为目的地与同行人，兼看父母（行程、票据）',
      'kao': '父母为用（成绩、文书），兼看官鬼（名次、录取）',
      'shiwu': '妻财为用（财物），文书证件类兼看父母',
      'qi': '请按所问事由自取用神，并说明取用理由'
    };
    var nowQ = effNow();
    var qTime = nowQ.getFullYear() + '年' + (nowQ.getMonth()+1) + '月' + nowQ.getDate() + '日 '
      + nowQ.getHours() + '时' + nowQ.getMinutes() + '分' + nowQ.getSeconds() + '秒';
    var txt = '所问事由：' + (zhanwen || '未填写') + '\n';
    txt += '占问分类：' + cat + '\n';
    txt += '参考用神：' + (CAT_YONGSHEN[lyTopic.cat] || CAT_YONGSHEN['']) + '\n';
    txt += '起卦时间：' + qTime + '\n';
    // 起卦四柱与月建日辰旬空（与盘面同一 lunar 口径）
    var dayGz = '', dayGan = '甲', monthZhi = '', xk = '';
    try {
      if (window.Lunar) {
        var lq = window.Lunar.fromDate(nowQ);
        dayGz = lq.getDayGan() + lq.getDayZhi();
        dayGan = lq.getDayGan();
        monthZhi = lq.getMonthZhi();
        xk = xunkong(dayGz);
        txt += '起卦四柱：年 ' + lq.getYearGan() + lq.getYearZhi() + '｜月 ' + lq.getMonthGan() + lq.getMonthZhi()
          + '｜日 ' + dayGz + '｜时 ' + lq.getTimeGan() + lq.getTimeZhi() + '\n';
        txt += '月建：' + monthZhi + '｜日辰：' + dayGz + '｜旬空：' + (xk || '无') + '\n';
        try { txt += '农历：' + lq.getYearInChinese() + '年' + lq.getMonthInChinese() + '月' + lq.getDayInChinese() + '\n'; } catch (e) {}
      }
    } catch (e) {}
    if (lySect === 2) txt += '纳甲流派：流派二 · 二老时迁（《易冒》）——乾、坤纳干随阴阳遁换位，本盘已按起卦时刻所属遁期装卦；纳支与流派一同。\n';
    txt += '\n本卦：' + (g ? g[0] : '?') + '（' + gong.name + '宫，宫五行 ' + gong.wx + '）\n';
    if (g && g[1]) txt += '卦辞：' + g[1] + '\n';
    var names = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
    var nj = najia(key, nowQ);
    var sy = getShiYing(key);
    var beasts = [];
    try { beasts = liushou(dayGan) || []; } catch (e) {}
    // 伏神（与盘面同一算法：本宫首卦中缺的六亲）
    var fuShen = ['', '', '', '', '', ''];
    try {
      var pureKey = null;
      for (var bi = 0; bi < BAGONG.length; bi++) {
        if (BAGONG[bi][0] === gong.name) { pureKey = BAGONG[bi][2][0]; break; }
      }
      if (pureKey) {
        var pureNj = najia(pureKey, nowQ);
        var curQin = {};
        for (var ci = 0; ci < 6; ci++) curQin[liuqin(gong.wx, ZHI_WX[nj[ci].zhi])] = 1;
        for (var fi = 0; fi < 6; fi++) {
          var fq = liuqin(gong.wx, ZHI_WX[pureNj[fi].zhi]);
          if (!curQin[fq]) fuShen[fi] = fq + pureNj[fi].gan + pureNj[fi].zhi;
        }
      }
    } catch (e) {}
    txt += '【本卦六爻】（自初爻至上爻）\n';
    for (var i = 0; i < 6; i++) {
      var l = lines[i];
      var isKong = xk && xk.indexOf(nj[i].zhi) >= 0;
      txt += names[i] + '：' + (beasts[i] ? beasts[i] + ' ' : '')
        + liuqin(gong.wx, ZHI_WX[nj[i].zhi]) + ' ' + nj[i].gan + nj[i].zhi + '（' + ZHI_WX[nj[i].zhi] + '）'
        + ' ' + (l.yao === 1 ? '阳爻' : '阴爻')
        + (l.dong ? (l.yao === 1 ? ' 动（老阳，变阴）' : ' 动（老阴，变阳）') : '')
        + (i === sy.shi ? '【世】' : '') + (i === sy.ying ? '【应】' : '')
        + (isKong ? '【旬空】' : '')
        + (fuShen[i] ? '｜伏神 ' + fuShen[i] + ' 伏于此爻之下' : '')
        + '\n';
    }
    // 变卦（有动爻才有）
    var hasDong = lines.some(function (x) { return x.dong; });
    if (hasDong) {
      var bianLines = lines.map(function (x) { return { yao: x.dong ? (1 - x.yao) : x.yao }; });
      var bianKey = guaKey(bianLines);
      var bianG = GUA[bianKey];
      var bianGong = getGong(bianKey);
      var bianNj = najia(bianKey, nowQ);
      var bianSy = getShiYing(bianKey);
      var dongIdx = [];
      lines.forEach(function (x, di) { if (x.dong) dongIdx.push(names[di]); });
      txt += '\n变卦：' + (bianG ? bianG[0] : '?') + '｜动爻：' + dongIdx.join('、') + '\n';
      if (bianG && bianG[1]) txt += '变卦卦辞：' + bianG[1] + '\n';
      txt += '【变卦六爻】（六亲照本卦宫五行取——《增删卜易》「六亲须照前卦而按」；变卦不另安世应）\n';
      for (var j = 0; j < 6; j++) {
        txt += names[j] + '：' + liuqin(gong.wx, ZHI_WX[bianNj[j].zhi]) + ' ' + bianNj[j].gan + bianNj[j].zhi + '（' + ZHI_WX[bianNj[j].zhi] + '）'
          + ' ' + (bianLines[j].yao === 1 ? '阳爻' : '阴爻')
          + (lines[j].dong ? '（由本卦' + names[j] + '变来）' : '')
          + '\n';
      }
    } else {
      txt += '\n变卦：无动爻，静卦（无变卦）\n';
    }
    try {
      var hg = GUA[huGua(key)], cg2 = GUA[cuoGua(key)], zg = GUA[zongGua(key)];
      txt += '互卦：' + (hg ? hg[0] : '?') + '｜错卦：' + (cg2 ? cg2[0] : '?') + '｜综卦：' + (zg ? zg[0] : '?') + '\n';
    } catch (e) {}
    /* 结构判读（本站规则引擎，与盘面判读卡同一结论；只述结构与状态，不下吉凶断语） */
    try {
      var dgAi = computeDuan(lines, { monthZhi: monthZhi, dayGz: dayGz, dayGan: dayGan, xk: xk, date: nowQ }, lyTopic.cat, lyTopic.gender);
      txt += '\n【结构判读】（规则引擎判读，供参考，勿与卦象数据冲突）\n';
      dgAi.rows.forEach(function (r) {
        txt += r.label + '：' + r.items.join(' ') + '\n';
      });
      txt += '应期口径：上文「应期」一行仅为传统规则对应的【候选地支】，讲时间时只可引用候选地支（如逢某支之日、之月），严禁换算成公历日期或具体某一天。\n';
    } catch (e) {}
    window.__wuriChartText = window.__wuriChartText || {};
    window.__wuriChartText.liuyao = txt;
  }

  document.addEventListener('DOMContentLoaded', init);

  return { open: open, close: close, buildChartText: buildChartText, duan: duanFor };
})();
