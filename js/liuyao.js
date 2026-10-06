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

  var lines = [];  // 已摇出的爻，自下而上：{yao: 0/1, dong: bool, coins: [h,h,h]}
  var shaking = false;

  function $(id) { return document.getElementById(id); }

  /* 摇一次：三枚铜钱 */
  function throwCoins() {
    var coins = [];
    for (var i = 0; i < 3; i++) {
      coins.push(Math.random() < 0.5 ? 0 : 1);  // 0=字(阴), 1=花(阳)
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

  function renderResult() {
    if (lines.length < 6) return;
    var key = guaKey(lines);
    var g = GUA[key];
    $('ly-result-card').hidden = false;
    if (g) {
      $('ly-gua-name').textContent = g[0] + '卦';
      $('ly-gua-ci').innerHTML = '<div class="ly-ci-old">' + g[1] + '</div>' +
        (g[2] ? '<div class="ly-ci-modern">' + g[2] + '</div>' : '');
    } else {
      $('ly-gua-name').textContent = '（卦象异常）';
      $('ly-gua-ci').textContent = '';
    }
    // 变卦
    var hasDong = lines.some(function (l) { return l.dong; });
    if (hasDong) {
      var bianLines = lines.map(function (l) {
        return { yao: l.dong ? (1 - l.yao) : l.yao, dong: false };
      });
      var bkey = guaKey(bianLines);
      var bg = GUA[bkey];
      $('ly-biangua').hidden = false;
      // 渲染变卦爻
      var box = $('ly-lines-bian');
      box.innerHTML = '';
      for (var i = 5; i >= 0; i--) {
        var l = bianLines[i];
        var d = document.createElement('div');
        d.className = 'ly-line ' + (l.yao === 1 ? 'yang' : 'yin');
        d.innerHTML = l.yao === 1 ? '<span class="ly-bar"></span>'
          : '<span class="ly-bar left"></span><span class="ly-bar right"></span>';
        box.appendChild(d);
      }
      if (bg) {
        $('ly-gua-name-bian').textContent = bg[0] + '卦';
        $('ly-gua-ci-bian').innerHTML = '<div class="ly-ci-old">' + bg[1] + '</div>' +
          (bg[2] ? '<div class="ly-ci-modern">' + bg[2] + '</div>' : '');
      }
    } else {
      $('ly-biangua').hidden = true;
    }
    // 爻辞详情
    var detail = $('ly-yao-detail');
    var names = ['初', '二', '三', '四', '五', '上'];
    var html = '<div class="card-title">爻位</div>';
    // 从上爻到初爻，跟图形顺序一致（上在上，初在下）
    for (var i = 5; i >= 0; i--) {
      var l = lines[i];
      html += '<div class="ly-yao-row"><span>' + names[i] + '爻</span><span>' +
        (l.yao === 1 ? '阳' : '阴') + (l.dong ? '（动）' : '') + '</span></div>';
    }
    detail.innerHTML = html;
    // 保存历史
    var bianName = '';
    if (hasDong) {
      var bk = guaKey(lines.map(function (l) { return { yao: l.dong ? (1 - l.yao) : l.yao }; }));
      var bbg = GUA[bk];
      if (bbg) bianName = bbg[0];
    }
    saveHistory(g ? g[0] : '', bianName);
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
    window._lyShakeHandler = function (e) {
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
    window.addEventListener('devicemotion', window._lyShakeHandler);
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
        renderResult();
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

  document.addEventListener('DOMContentLoaded', init);

  return { open: open, close: close };
})();
