/* 六爻占卜：铜钱摇卦
 * 三枚铜钱摇六次，自下而上成卦
 * 字为阴（--），花为阳（—）
 * 三花=老阳○（动），三字=老阴×（动）
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
  // 纳干：[内卦干, 外卦干]，按上卦(外)下卦(内)的八卦
  var NA_GAN = { '111': ['壬', '甲'], '000': ['癸', '乙'], '100': ['庚', '庚'], '011': ['辛', '辛'], '010': ['戊', '戊'], '101': ['己', '己'], '001': ['丙', '丙'], '110': ['丁', '丁'] };
  // 纳支：内卦起支，外卦起支；阳顺阴逆
  // 下卦(内)：乾甲子 震甲子 巽丑 坎寅 艮辰 兑巳 离卯 坤未
  var NA_ZHI_NEI = { '111': '子', '100': '子', '011': '丑', '010': '寅', '001': '辰', '110': '巳', '101': '卯', '000': '未' };
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
  // 世应：返回世爻索引(0-5, 0为初爻)
  var SHI_YING = {
    '111111': 5, '000000': 5, // 乾坤为六世
    '111110': 0, '000001': 0, // 天风姤/地雷复为一世
    '111010': 1, '000010': 1, // 天山遁/地泽临为二世
    '111011': 2, '000011': 2, // 天地否/地天泰为三世
    '101011': 3, '010100': 3, // 风地观/水山蹇为四世
    '011011': 4, '100010': 4  // 泽山咸/山水蒙为五世
    // 游魂/归魂另算，简化：不在表中的按一世处理
  };
  function getShiYing(guaKey) {
    var shi = SHI_YING[guaKey];
    if (shi === undefined) shi = 0;
    return { shi: shi, ying: (shi + 3) % 6 };
  }
  function getGong(guaKey) {
    for (var i = 0; i < BAGONG.length; i++) {
      if (BAGONG[i][2].indexOf(guaKey) >= 0) return { name: BAGONG[i][0], wx: BAGONG[i][1] };
    }
    return { name: '?', wx: '?' };
  }
  // 纳甲装卦：返回每爻 {gan, zhi}
  function najia(guaKey) {
    // guaKey: 6位，下爻在前。如 '111111' 为乾
    var lower = guaKey.slice(0, 3).split('').reverse().join(''); // 下卦，上爻在前
    var upper = guaKey.slice(3, 6).split('').reverse().join(''); // 上卦
    // 注意：GUA的key是"下爻在前"，如乾'111111'，前3位是下卦(111)，后3位是上卦(111)
    // 但NA_GAN的key是"上爻在前"的3位二进制，如乾卦111
    var lowerKey = guaKey.slice(0, 3).split('').reverse().join('');
    var upperKey = guaKey.slice(3, 6).split('').reverse().join('');
    var ganNei = NA_GAN[lowerKey][1], ganWai = NA_GAN[upperKey][0];
    var zhiNeiStart = NA_ZHI_NEI[lowerKey], zhiWaiStart = NA_ZHI_NEI[upperKey];
    // 判断阴阳：下卦
    var lowerYang = (guaKey[0] === '1' && guaKey[1] === '1' && guaKey[2] === '1') || (lowerKey === '111' || lowerKey === '100' || lowerKey === '010' || lowerKey === '001');
    // 简化：阳卦顺行，阴卦逆行。乾震坎艮为阳，巽离坤兑为阴
    var yangGua = { '111': 1, '100': 1, '010': 1, '001': 1 };
    var neiYang = !!yangGua[lowerKey], waiYang = !!yangGua[upperKey];
    var res = [];
    var zi = zhiIdx(zhiNeiStart);
    for (var i = 0; i < 3; i++) {
      // 内卦初二三爻：隔位跳（子→寅→辰...阳顺；子→戌→申...阴逆）
      var z = ZHI[(zi + (neiYang ? i * 2 : -i * 2) + 24) % 12];
      res.push({ gan: ganNei, zhi: z });
    }
    zi = zhiIdx(zhiWaiStart);
    for (var j = 0; j < 3; j++) {
      var z2 = ZHI[(zi + (waiYang ? j * 2 : -j * 2) + 24) % 12];
      res.push({ gan: ganWai, zhi: z2 });
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
    var yang = coins[0] + coins[1] + coins[2];
    var yao, dong = false;
    if (yang === 3) { yao = 1; dong = true; }       // 老阳 ○
    else if (yang === 0) { yao = 0; dong = true; }  // 老阴 ×
    else if (yang === 2) { yao = 1; dong = false; } // 少阳 —
    else { yao = 0; dong = false; }                // 少阴 --
    return { yao: yao, dong: dong, coins: coins };
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
    // 自上而下显示（第六爻在上）
    for (var i = lines.length - 1; i >= 0; i--) {
      var l = lines[i];
      var d = document.createElement('div');
      d.className = 'ly-line ' + (l.yao === 1 ? 'yang' : 'yin') + (l.dong ? ' dong' : '');
      if (l.yao === 1) {
        d.innerHTML = '<span class="ly-bar"></span>' + (l.dong ? '<span class="ly-dong">○</span>' : '');
      } else {
        d.innerHTML = '<span class="ly-bar left"></span><span class="ly-bar right"></span>' + (l.dong ? '<span class="ly-dong">×</span>' : '');
      }
      box.appendChild(d);
    }
    // 未摇出的爻显示虚线
    for (var j = lines.length; j < 6; j++) {
      var e = document.createElement('div');
      e.className = 'ly-line empty';
      e.innerHTML = '<span class="ly-bar ghost"></span>';
      box.insertBefore(e, box.firstChild);
    }
  }

  function saveHistory(guaName, bianName) {
    try {
      var q = $('ly-question-input');
      var rec = {
        time: new Date().toISOString(),
        question: q ? q.value.trim() : '',
        gua: guaName,
        bian: bianName || '',
        lines: lines.map(function (l) { return { yao: l.yao, dong: l.dong }; })
      };
      var h = JSON.parse(localStorage.getItem('ly_history') || '[]');
      h.unshift(rec);
      if (h.length > 300) {
        h = h.slice(0, 300);
        try {
          if (!localStorage.getItem('ly_history_full_warned')) {
            localStorage.setItem('ly_history_full_warned', '1');
            setTimeout(function () { alert('占卜历史已满300条，新记录将覆盖最早的记录。'); }, 500);
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
      var now = new Date();
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
      var cats = ['综合','感情','事业','财运','健康','学业','出行','其他'];
      var curCat = '';
      try { curCat = localStorage.getItem('wuri_ly_cat') || '综合'; } catch (e) { curCat = '综合'; }
      var catOpts = cats.map(function (cc) {
        return '<option value="' + cc + '"' + (cc === curCat ? ' selected' : '') + '>' + cc + '</option>';
      }).join('');
      var headerHtml = '<div class="ly-head-pro">'
        + '<div class="ly-head-row"><span class="ly-head-label">占问</span><span class="ly-head-val" id="ly-zhanwen-disp" onclick="(function(){var cur="";try{cur=localStorage.getItem("wuri_ly_zhanwen")||"";}catch(e){}var v=prompt("占问事由",cur);if(v!==null){try{localStorage.setItem("wuri_ly_zhanwen",v);}catch(e){}document.getElementById("ly-zhanwen-disp").textContent=v||"点击此处编辑占问事由";}})()" style="cursor:pointer">' + (zhanwen ? escHtml(zhanwen) : '点击此处编辑占问事由') + '</span></div>'
        + '<div class="ly-head-row"><span class="ly-head-label">分类</span><select id="ly-cat-sel" class="ly-cat-sel">' + catOpts + '</select></div>'
        + '<div class="ly-head-row"><span class="ly-head-label">归档</span><span class="ly-head-val" id="ly-cat-disp">' + curCat + '</span></div>'
        + '<div class="ly-head-row"><span class="ly-head-label">时间</span><span class="ly-head-val">' + timeStr + lunarStr + '</span></div>'
        + '</div>';
      var detail = $('ly-yao-detail');
      // 分类选择事件
      setTimeout(function () {
        var sel = $('ly-cat-sel');
        if (sel) sel.addEventListener('change', function () {
          try { localStorage.setItem('wuri_ly_cat', this.value); } catch (e) {}
          var d = $('ly-cat-disp');
          if (d) d.textContent = this.value;
        });
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
    var nj = najia(key);
    // 日辰：用当前日期的干支（lunar-javascript）
    var dayGz = '', dayGan = '甲';
    try {
      if (window.Lunar) {
        var now = new Date();
        var l = window.Lunar.fromDate(now);
        dayGz = l.getDayGan() + l.getDayZhi();
        dayGan = l.getDayGan();
      }
    } catch (e) {}
    var xk = dayGz ? xunkong(dayGz) : '';
    var beasts = liushou(dayGan);
    // 四柱（带五行颜色）
    var sizhu = ['', '', '', ''];
    var sizhuHtml = '';
    try {
      if (window.Lunar) {
        var now = new Date();
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
        var pureNj = najia(pureKey);
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
    var bianNj = hasDong ? najia(bianKey) : null;
    var bianGong = hasDong ? getGong(bianKey) : null;
    var bianSy = hasDong ? getShiYing(bianKey) : null;
    // 标题：四柱+旬空
    // 四柱 HTML：直接用 sizhuHtml（已经是4组，空格分隔），不用 split
    var szSpans = ['', '', '', '', ''];
    try {
      if (window.Lunar) {
        var now2 = new Date();
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
    var bianName = (hasDong && bianG) ? bianG[0] + '(' + bianGong.name + ')' : (g ? g[0] + '(' + gong.name + ')' : '?');
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
      // 六神+伏神同行
      var shenFu = beasts[i] + (fuShen[i] ? ' ' + fuShen[i] : '');
      // 变卦
      var bInfo = info, bBar = yaoBar3(l.yao === 1), bSY = syMark;
      if (hasDong && bianNj) {
        var bWx = ZHI_WX[bianNj[i].zhi];
        var bQinFull = liuqin(bianGong.wx, bWx);
        var bQin = {'官鬼':'官','父母':'父','兄弟':'兄','妻财':'财','子孙':'孙'}[bQinFull] || bQinFull;
        bInfo = bQin + ' ' + bianNj[i].gan + bianNj[i].zhi;
        bBar = yaoBar3(bianLines[i].yao === 1);
        bSY = '';
        if (i === bianSy.shi) bSY = ' 世';
        else if (i === bianSy.ying) bSY = ' 应';
      }
      html += '<tr' + (l.dong ? ' class="lyx-mv"' : '') + '>'
        + '<td class="lyx-shen">' + shenFu + '</td>'
        + '<td><span class="lyx-info">' + info + '</span>' + bar + dong + syMark + '</td>'
        + '<td><span class="lyx-info">' + bInfo + '</span>' + bBar + bSY + '</td></tr>';
    }
    html += '</table>';
    // 互卦/错卦/综卦
    var hg = GUA[huGua(key)], cg = GUA[cuoGua(key)], zg = GUA[zongGua(key)];
    html += '<div class="ly-hcz">互卦：' + (hg ? hg[0] : '?') + '　错卦：' + (cg ? cg[0] : '?') + '　综卦：' + (zg ? zg[0] : '?') + '</div>';
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

  function reset() {
    lines = [];
    shaking = false;
    $('ly-coins').innerHTML = '';
    $('ly-result-card').hidden = true;
    $('ly-status').textContent = '摇一摇手机，或点下方按钮开始';
    renderLines();
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
    reset();
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
        r.gua + '卦' + (r.bian ? ' → ' + r.bian + '卦' : '') + '</span><span class="ly-history-time">' + ds + '</span></div>' +
        (r.question ? '<div class="ly-history-q">' + r.question.replace(/</g, '&lt;') + '</div>' : '') + '</div>';
    });
    box.innerHTML = html;
    // 点击查看
    box.querySelectorAll('.ly-history-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var r = h[parseInt(el.getAttribute('data-idx'), 10)];
        if (!r || !r.lines) return;
        lines = r.lines.map(function (l) { return { yao: l.yao, dong: l.dong, coins: [] }; });
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
    renderLines();
  }

  function buildChartText() {
    if (lines.length < 6) return;
    var key = guaKey(lines);
    var g = GUA[key];
    var gong = getGong(key);
    var zhanwen = '';
    try { zhanwen = localStorage.getItem('wuri_ly_zhanwen') || ''; } catch (e) {}
    var nowQ = new Date();
    var qTime = nowQ.getFullYear() + '年' + (nowQ.getMonth()+1) + '月' + nowQ.getDate() + '日 '
      + nowQ.getHours() + '时' + nowQ.getMinutes() + '分' + nowQ.getSeconds() + '秒';
    var txt = '所问事由：' + (zhanwen || '未填写') + '\n起卦时间：' + qTime + '\n';
    txt += '本卦：' + (g ? g[0] : '?') + '（' + gong.name + '宫）\n';
    var names = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
    var nj = najia(key);
    var sy = getShiYing(key);
    for (var i = 0; i < 6; i++) {
      var l = lines[i];
      txt += names[i] + '：' + nj[i].gan + nj[i].zhi + ' ' + liuqin(gong.wx, ZHI_WX[nj[i].zhi])
        + ' ' + (l.yao === 1 ? '阳' : '阴') + (l.dong ? ' 动' : '')
        + (i === sy.shi ? ' 世' : '') + (i === sy.ying ? ' 应' : '') + '\n';
    }
    if (g) txt += '卦辞：' + g[1] + '\n';
    window.__wuriChartText = window.__wuriChartText || {};
    window.__wuriChartText.liuyao = txt;
  }

  document.addEventListener('DOMContentLoaded', init);

  return { open: open, close: close, buildChartText: buildChartText };
})();
