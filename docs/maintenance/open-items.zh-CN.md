<p align="right"><a href="open-items.md">English</a> | <a href="open-items.zh-CN.md"><b>简体中文</b></a> · <a href="../../MAINTENANCE.zh-CN.md">维护手册</a></p>

# 待办与未确认

"知道但没修"只写在这一处。`CHANGELOG.md` 记的是已经做了的事，一条未修的记录没有
提交可挂；`docs/reports/AUDIT.md` 是它自己那次提交的快照——所以一样东西如果不在这里，
就是被刻意忘掉的。内容拆自 `MAINTENANCE.md` §13。

下面用到的状态词：**已排期** = 已同意，等下一次代码批准；**已延后** = 知道，明确不是
这一轮；**不做** = 已评估并判定不值它的成本，只在新证据面前重开。

## 1. 服务商与凭据

- 百度与有道的语言表是**故意不完整**的：两家官方文档的表格由客户端渲染，读不回来，
  也没有凭据去探测。缺码会返回清晰的本地提示，而错码会返回一个令人费解的 HTTP 200
  错误体。拿到真实凭据后需重新核实。
- 百度/有道架构完成但**从未端到端跑过**——没有凭据。腾讯（TC3-HMAC-SHA256）、阿里
  云（HMAC-SHA1 RPC）、华为云（SDK-HMAC-SHA256）不需要新增依赖：GLib 原生覆盖。
- **`curl` 看到的 Google 429 是 curl 的问题，不是扩展的问题。**
  `translate.googleapis.com…client=gtx` 对 curl 返回 429，对 Soup（扩展用的客户端）
  返回 200。要复现 Google 故障请用 `Soup`/`gjs` 探测，不要用 curl。扩展现已改用
  `clients5.google.com…client=dict-chrome-ex`——即返回词典段的那个端点。

## 2. 属未验证、而非已修复的行为

- **RTL：已实测，而 CSS 表达不了。** `StThemeNode.get_text_align()` 在这套栈里是绑定的，
  所以取值表已在 50.1 上直接读出：`left`→0、`center`→1、`right`→2，但 `start`→0、
  `end`→0——与一个不认识的关键词完全相同（`banana`→0），并且把 actor 的
  `text-direction` 设成 RTL 也不变。也就是说 St 认这两个词但一律映射到 LEFT，
  `text-align: start` **不是**方向相关的，修不了警告标签。唯一的杠杆是在 JS 里按语言对
  选 `left`/`right`，那是等行为改动的决定，等他拍板；标题箭头在 RTL 语言对里仍指 `➜`。
  `test/eval-test.js` 的 Test 5 把这几个值钉住了，所以将来 St 若真的变得方向相关，是套件
  变红，而不是"修复悄悄变得可行"。
- **dest 面板空白：机理已量到，观感仍未看。** 竖向滚动条会拿走 **8 像素**（L1 断言：300px 的
  `St.ScrollView` 把子元素排到 292；卡片走 `_applyHeightCaps()` 时目的地标签从 650 变 642），
  而 `SCROLLBAR_ESTIMATE` 刻意留 16——于是换行宽度被量得比实际窄 8px，钉住的高度因此略偏高，
  这就是那点空白。真机上是否看得见仍需人眼确认；数字本身已经不是未知了。
- 弹窗的真机行为，以及那约 40 ms/30s 的空闲增量来源（若用更多窗口能分辨的话）仍未
  归因。
- **`shell-version` 声明 45–50，但 45–49 从未跑过。** 本仓所有数字都来自 50.1。见
  [compatibility-matrix.zh-CN.md](compatibility-matrix.zh-CN.md)。

## 3. 刻意只做了一半的功能——不要擅自补完

- **词典卡（D-021、D-023、D-025、D-028）只挂在 Google 上，且是部分实现。** 只有 Google 返回
  词典数据；DeepL/百度不返回（有道会，但需要 key）。单个词即使当前选的是别的服务商，也会
  自动路由到 Google（D-022，`looksLikeWord`）；整句仍用所选服务商。卡片由一组结构化
  actor 组成——译文标题、音标、按词性分组的义项、例句，再是同义词（`d[11]`）与英文释义
  （`d[12]`），各带自己的样式类。显示量有上限（6 个词性、20 个义项、5 条例句、2 组同义词/
  释义），虽然 Google 给得更多。同义词与英文释义只有英文词才有：ZH→EN 的中文词前向请求两者
  皆无，因此会再反向查一次 EN→ZH 并合并（D-028，`_enrichZhToEnDict`/`mergeEnrichedDict`），
  卡片先出、后台补全，补查失败或超时（6s）静默保留前向卡片。复制按钮复制的是译文，不是整张卡。
  Google 响应**不进 LRU 缓存**（单词与句子的响应形状不同），靠 2.5 s 同文本冷却兜底。
- **自动方向（D-024、D-026、D-027）只覆盖 ZH/EN 两种语言、且只对词生效。** 当检测到的输入
  语言等于配置的目标语言时反转方向（`resolveDirection`）；检测器只认汉字→ZH、拉丁字母→EN。
  整句保持配置方向。`AUTO` 源另有分支：检测语言等于目标基码时改译到 ZH<->EN 的对侧（D-027），
  消除默认 AUTO→EN 复制英文词的原样回显。卡片标题显示有效方向（D-026），源为 AUTO 时改用
  Google 回复里的 `detectedLang` 刷新标题（D-027，`applyDetectedSource`）；⇄ 交换该显示对，
  标题不会再与卡片不一致；交换是临时的，绝不改写配置里的 `source-lang`/`target-lang`。
- **`looksLikeWord` 是保守启发式。** 无空白、码点 ≤ 40、无句末标点的 token 才算词。
  因此无空格无标点的 CJK 长片段会被当成词发给 Google；代价仅是该片段由 Google 而非
  所选服务商翻译。
- **prefs 不按服务商过滤语言下拉。** 百度仍能在选择器里选到它映射表拒绝的 6 种
  （ID、LT、LV、SK、SL、TR）；修法是让报错点名具体语言对，而不是藏掉选项——过滤
  共享枚举会让这行偏好依赖服务商状态，还可能藏起用户已经存过的语言。
- 那 5 个遗留 schema 键（`auto-copy`、`auto-paste`、`auto-translate`、
  `keybinding-translate-clipboard`、`shortcut-enabled`）已在 schema 里加注说明，但
  **刻意不删**：删键会丢掉用户已存的值，属于删功能。
- **`po/` 是手工维护的，守卡就是它的覆盖检查。** 本机自 2026-10-10 起装了 gettext，
  `scripts/update-po.sh` 能跑了；但 `scripts/update-pot.sh` **不准用**：在本 fork 上实测，它会重写成
  让一条 `// Translators:` 提示消失（`extension.js:1534`，那条讲 `%s` 单请求上限的句子）、并让每份
  目录多出 43 条"模板已不认识"的条目，于是五条仓库守卡一起变红。所以仍然由 `test/repo.test.js`
  断言：每个 `_()` 字面量都要出现在 `messages.pot` **和** de/es/nl 三份里，任何目录都不许带着模板已
  不认识的 msgid，任何目录都不许把同一条 msgid 定义两遍（obsolete `#~` 也算——见 `MAINTENANCE.md`
  第 10 节的打包条目），而源码里每条 `// Translators:` 提示都必须以 `#.` 注释落到这四个文件。
  D-021 的词性 msgid 是**活串**（`extension.js:102-103`）；它们过去无副作用是因为根本没有 `.mo`
  产出，现在它们被编进目录却仍未翻译，所以两种情况下都按英文原文显示。
- `po/` 上还欠着的是**源码已经不再请求的条目**——真实数量比这里记了一个月的"74"要小，因为
  `schemas/*.gschema.xml` 是第二个可翻译来源（`<summary>`/`<description>`，同一个 gettext-domain），
  而旧算法把它们算进了死条目。别信任何一个数，两个集合都要自己打出来：
  `xgettext --from-code=UTF-8 --add-comments=Translators -o - -- *.js schemas/*.xml | grep -c '^msgid '`
  是 gettext 认为源码在请求的量，再用 `msgcomm` 把这份模板与 `po/messages.pot` 对撞，就能逐条列出
  重生成会退役哪些。删它们就是动三位署名译者写下的文件，所以等维护者拍板。它们的 `#:` 引用也还是
  上游时代的行号：2026-10-10 按 locale 实测，落在**仍活着**的 JS 串上的引用 token 里有 38 个指的并
  不是真正的 `_()` 调用行，涉及 27 条条目，另有 28 个落在 gschema 条目上。模板本身是干净的（活串
  引用 119 个 token，0 个过期），因为本仓只在自己新增或改动过的条目上重算了引用，译者的那些行没碰。
- **目录守卡的作用域只有 JS，所以 schema 自己那些可翻译的串可以在所有门全绿的情况下跑偏。**
  `test/repo.test.js` 读的是 `TRANSLATED = ["extension.js", "prefs.js", "translation-helper.js"]`；
  而 `schemas/*.gschema.xml` 在 `<schemalist>` 上声明了 `gettext-domain`，因此它同样在向 gettext
  索要 `<summary>`/`<description>` 这些串，可没有任何东西断言它们到位了。2026-10-10 实测：源码请求
  161 条内容 msgid，模板里有 189 条，共有 146 条——也就是说**源码（schema）在请求的 15 条根本不在
  `po/messages.pot` 里**（de/es/nl 也不在：抽了 `Baidu Translate APP ID`、`Show panel icon`、
  `Close floating window` 三条，每份都是 0 命中），同时模板里有 43 条已经没人请求。这 15 条不是"没有
  生成器"造成的：模板里那些 schema 行还是**百度/有道之前**的措辞，例如 msgid
  `"The translation service to use (DeepL or Google Translate)"`，而 schema 现在写的是
  `(Google Translate, DeepL, Baidu or Youdao)`。结论：任何一个改了服务商名字或加了密钥的 fork，都会
  悄悄把自己那套设置 schema 变成未翻译状态。**还欠着，而且不能直接加门**："schema 请求的每条 msgid
  都要在模板里"这条断言现在就是红的，所以它必须和那 15 条的回填（`msgstr` 留空——不编造译文）落在
  同一个改动里，而 43 条的删除等维护者拍板。别信上面这段话，自己打出来：
  `xgettext --from-code=UTF-8 --add-comments=Translators -o - -- *.js schemas/*.xml` 与
  `po/messages.pot` 对比，交集用 `msgcomm`。schema 的 `description` 到底会不会**显示**成译文，还取决于
  编译 schema 的那一方有没有传 `--gettext-package`，这台机器从未观察到 *(需人工确认)*。
- **`.mo` 发的比目录看起来有的少。** `msgfmt` 只把 `msgstr` 非空**且**不是 `#, fuzzy` 的条目写进去，
  所以每份目录真正随包发布的译文数是
  `msgfmt --statistics -c -o /dev/null po/de.po` 里的 translated 那个数；fuzzy 的那些（de/nl 10 条、
  es 29 条）在译者清掉标记之前对用户根本不存在。这不是代码能决定的，是翻译工作。

## 4. 一条守不住"生产真正走的那条分支"的守卫

- **`swapLanguages` 曾有单元测试，但 `extension.js` 没调用它。**
  `test/unit.test.js` 断言它的 `AUTO` 守卫（"swapLanguages guard" 一节），这个判定
  在运行时也确实生效——但 `onSwap` 里带的是它的**内联副本**。于是那条 L0 记录无论生产
  行为对不对都会通过，将来改动内联分支时 Node 依然全绿。已修（D-032）：`onSwap` 改为
  调用 helper，而 `test/repo.test.js` 现在把「哪几条纯判定被 L0 钉住」列成清单，并逐条
  断言 `extension.js` 真的有调用点——守的是这一类缺陷，不只是这一个实例。
- `parseLanguageName` 与 `detectLang` 从 `translation-helper.js` 导出，却只被
  `test/unit.test.js` 引用。**已延后**：它们不是"看见就删"的死代码——一条钉住请求/签名
  行为的测试比一份干净的导出列表更值钱，尤其对那两家没有凭据可探测的服务商。它们被
  故意留在 `test/repo.test.js` 的调用点清单之外——那张表目前只覆盖用户真能碰到的五条
  判定；把它们加进去是仍欠的那半边。
- `test/prefs-validator.js` 不再只断言 `fillPreferencesWindow()` 不抛异常：它为四个服务商
  各渲染一次，断言每家里披露的主机名，数出 7 条恢复/清除行并分两遍点击驱动它们，还把
  Escape 开关来回拨一遍。它依旧做不到的是校验键**名**——那份 `Gio.Settings` 是只记录调用的
  mock，所以恢复列表里写了 schema 里根本不存在的键，这里照样通过，只有真机才会暴露。它的三组
  断言（主机名披露、两遍计数、`strv` 往返）是照着已经写好的代码补的，各自都还没单独逼红，
  见 `verification.zh-CN.md` 第 3 节。
- **文档门仍然查不到的两件事。** 链接与锚点巡检现在是真的门了（`test/docs-lint.mjs`，记为
  D-048），于是剩下的两个洞是这两个，而且都不便宜：(1) 双语*配对*守卡只比 `##` 数量与语言切换
  行——中文某段丢了它英文对家还在的句子，没有任何东西会发现，主题对可以语义上跑偏而所有门全绿；
  (2) 没有东西能证明散文里写着的**数字**还和机器一致（规矩是"数量从命令里打出来"，但更早写下的
  散文会烂掉）。**都延后**：(1) 需要段落级对齐检查，那是一个真正的算法而不是一条正则，而且会把
  有意的改写也判红；(2) 除非每个计数都由它所描述的那个文件生成，否则没有可比对的 ground truth。
- **打包守卡仍然答不出的事。** `test/repo.test.js`（"打包清单发的就是仓库里有的"，D-052）钉住的是
  `scripts/pack.sh` 清单的**形状与顺序**。自 2026-10-10 起，本仓库真的产出过 zip 并且解开看过，那四个
  老问题里有三个当场关闭：`--extra-source=icons` 确实带上 `icons/` 下的每一个文件（进 18 个、出 18 个、
  逐字节相同）、根级源文件与仓库逐字节相同、`docs/`、`test/`、`scripts/` 和根目录 `*.md` 是真的不在产物
  里。`schemas/gschemas.compiled` 也弄清了：**工具从来不打它**，就算暂存树里摆着也不打（用对照树量过）；
  本机装着的扩展各有一份 compiled，而它的 mtime 比同目录的 `.xml` 晚好几个月——也就是说 compiled 是本地
  生成的，不是随包发布的。仍未被证明的只剩这些，而且都不是代码问题：装出来的包**能不能安装并加载**
  （`gnome-extensions install` 在本目录是禁止的，因为这个仓库本身就是 live 扩展目录），以及编译出的
  `.mo` 在真会话里**是否真的把界面渲染成译文**——本机没有生成任何 `de`/`es`/`nl` locale
  （`locale -a` 回答 0 个），所以德语界面在这台机器上观察不到 *(由维护者决定：生成 locale，或者把这条
  结论一直挂着)*。
- **`scripts/pack.sh` 在这台机器上退不出 0。** 它最后一步在仓库内的 `venv/` 里装 `shexli`（0.2.1），
  而 shexli 在 Python 3.14.4 下对一个解得开的 zip **段错误**（`Segmentation fault (core dumped)`，
  exit 139）——脚本内和单独跑各复现一次。所以现在 `pack.sh` 的非零退出码**说明不了产物好坏**：要认那行
  `✅ Packaging complete:`，然后自己解包看。这一条至今没动，因为改它属于依赖决定，不是修 bug。
- **L2 读数器仍然答不出的事。** 我们自己的设置窗已经在真实会话里为**四家**服务商各读过一遍
  （`gjs -m test/l2-prefs-dump.mjs`，D-049/D-050——分组标题、四条披露句各自点名自己的主机、恢复行
  在四家分别报 4/2/3/3 与 3、密钥字段被遮罩），所以"自 C3 起没人眼看过"这个洞在结构与文案层面已经
  合上。剩下的都不是仪器问题：(1) a11y 树给的是文本与状态、没有几何，所以那句长披露在窄窗口里
  **折行好不好读**仍然是人的判断；(2) 浮窗根本没在 a11y 树上出现过——壳只暴露 window 与 surface
  那些 panel——所以弹窗本身、它的深浅两套观感与多显示器定位没有代理侧的仪器，而那条触发又必须真人来
  （伪造会毁掉剪贴板里非文本的类型）。

## 5. 已延后的缺陷与它们现在的状态

2026-10-09 决定：那一轮只做稳定性与结构，所以下面这批隐私与设置类缺陷是被记录而不是
被修好。每条都是读代码核实过的，不是推断。后来修好的那些连记录一起留在这里，
免得查清它们的过程失传。

- **后台模式下翻译曾完全没有任何反馈。** `extension.js:721` 的内联错误路径要求
  `!isBackground`，而 `fail()` 只在 `notifications` 为真时才调 `Main.notify`，该键的
  schema 默认值当时是 **false**，于是默认配置下失败什么都看不到。不设开关的
  `_showError()`（`extension.js:1282`）只被 `:649` 的异常路径用到，覆盖不到服务商失败。
  已修（D-036）：默认改为 true，并由 `test/repo.test.js` 把这个默认值与描述它的文案钉在一起。
- **后台成功的 toast 把用户自己的文本写进通知。** `extension.js:687` 用标题
  "Translated" 调 `Main.notify`，正文是 `requestText + " → " + toText`——原文与译文
  一起进了通知正文，而通知正文也会显示在锁屏上。它还和上面那行自相矛盾：背景模式那一行
  写着"silently"，而 `floating-background-toast` 的默认是 true。已修（D-037）：默认改为
  false，并把那一行的副标题改成如实写出正文包含哪两半——让用户在知道泄漏形状的前提下选。
- **prefs 曾对文本发往何处一字不提。** 没有任何用户可见的说明告诉用户"被拷贝的文本会
  离开这台机器"、发给哪家服务商；单个词无论选什么都送去 Google（见上面第 3 节）也未披露。
  已修（D-038）：服务商那一行的副标题现在按 `PROVIDERS.host` 逐家生成，DeepL 因为它的路径
  就是用户自己填的 `url`，改用该设置里的主机名，并补上"单个词另外送去出词典卡"这句。
  *决定仍然有效：只披露——不加新开关、也不收窄（收窄会让词典卡回归失效）。*
  披露出去的主机名会与每个 builder 实际产出的 URL 对撞（`test/unit.test.js`）——一句说错
  对象的隐私声明比没有更糟。
- **完全没有"恢复默认"的入口**。已修（D-039）：每个非凭据分组都有一行调用 `reset_keys`
  且只 reset 自己那组键；三个凭据分组改成两击确认（第一击装填、第二击才删）——静默清掉
  用户从服务商那里领回来、再也复现不了的密钥不叫"恢复默认"。
- **设置窗口与它所在的包自相矛盾**：`prefs.js` 的 "Project Homepage" 指向
  `github.com/tazztone/translate-assistant`，而 `metadata.json` 的 `url` 指向本 fork；
  About 页也没有许可证一行。已修（D-040）：本 fork 那一行读 `this.metadata.url`，两者
  不可能再打架；上游保留自己可点开的一行以维持署名；许可证一行如实写出 MIT 与 `LICENSE`
  里点名的持有人。`LICENSE` 文件本身一字未动，这里也不下法律结论。
- 六个 `Adw.EntryRow`（DeepL URL、DeepL key、百度 appid/secret、有道 appid/secret）没有
  大白话说明，**而且做不到**：`AdwEntryRow` 根本没有 `subtitle` 属性——往构造函数里加一个，
  `gjs -m test/prefs-validator.js` 直接报 `TypeError: No property subtitle on AdwEntryRow`。
  所以解释文字只能落在分组 `description` 上，现已改成直接点明两个字段里哪个才是密钥（第 6 节）。
- `keybinding-close-floating-window` 是活的（`extension.js:49`、`:384`），现在以开/关
  开关的形式出现在 prefs 里（D-041）：关掉时记住原绑定，打开时还原它，没有旧值才回落到
  schema 自己的默认。它刻意**不是**按键编辑器——理由见第 6 节。
- **`updateServiceVisibility()` 曾硬编码 `service === 0/2/3`**（今天在
  `prefs.js:468-476`），把 `PROVIDERS` 表在第二个文件里重抄一遍：追加或调整服务商，
  设置窗口就会显示另一家的密钥框。已修（D-033）——`PROVIDERS` 现在声明
  `credentialGroup` 与 `supportsFormatting`，prefs 只读这两项；上面那条披露也就此有了
  落点。
- **`_enrichZhToEnDict` 会把一个 source 泄漏到 `disable()` 之后**——它的 `cancellable` 与
  `watchdogId` 是函数局部变量，`destroy()` 拿不到句柄，于是一个 6 秒定时器和一个在途请求
  活得比扩展还长。已修（D-030），现在被两处守住：L0 的 `test/teardown-guard.test.js` 与
  L1 的 `eval-test.js` Test 3i。
- **修这条泄漏才顶出更大的一条**：补查请求**从来没发出过**（D-029）。它的规格来自一个不返回
  `method` 的 builder，`Soup.Message.new` 抛异常，被调用方的 catch 吞掉——于是这项功能死掉
  的外观和文档里写的「补查失败静默保留前向卡片」一模一样。留下的长期教训写在
  `verification.md`：**脱离生产调用链的测量，证明不了任何功能。**
- **图标查找曾在壳主线程上做两次同步 `Gio.File.query_exists()`**，先探 `.svg` 再探
  `.png`。已修（D-034）：路径直接按名字点出随仓库安装的文件，「哪些图标存在」改由
  `test/repo.test.js` 断言，于是它从运行时探测变成仓库属性。被删掉的代价实测：暖缓存
  下每次刷新约 5.8 µs——按仓库规则记 `chore` 而非 `perf`。证明这件事的守卡自己也修过
  一次：它最初匹配到「该调用已删除」那行注释，所以现在断言前先剥掉整行注释
  （`test/repo.test.js` 的 `srcCode()`）。

## 6. 已评估：不值其成本，或本机做不到（只在新证据面前重开）

- **`St.ScrollView` → `St.Clip`**：不做。`St.Clip` 没有滚动条也没有惯性滚动，而这两处
  调用点与已实测的高度/上限修复纠缠在一起，为零用户可见收益去动它们会危及那些修复。
- **把弹窗重写成原生样式类 + 命名颜色**：暂不做。这些面板颜色是从 Yaru 手抄进
  `stylesheet-light.css` / `stylesheet-dark.css` 的常量；一轮完整的主题化会撞上
  `INVARIANTS.md` 里那条"全 shell 作用域 CSS"的危险，并把每一项弹窗测量重新打开。
- **把 `⇄`、`➜` 和旗子 emoji 语言标签换成 symbolic 图标**：暂不做。`➜` 同时是第 2 节里
  未决的 RTL 问题；旗子 emoji 住在 27+28 个 schema 枚举 nick 里，改它们等于为了外观去动
  schema。
- **给凭据行加逐行大白话副标题**：不是不愿，是不能。`AdwEntryRow` 没有 `subtitle` 属性
  （实测：校验器抛 `TypeError: No property subtitle on AdwEntryRow`），分组 `description`
  是这些行唯一能渲染解释文字的位置。
- **把链接行手搓的按钮换成 `Adw.ActionRow:activatable-uri`**：不做——至少不能从这台机器上
  做。它确实能省掉两个 `Gtk.Button` 后缀与一次 `launch_default_for_uri`，但
  `shell-version` 声明到 45，而 `Adw-1.typelib` 是无版本命名空间，本机无法证明该属性的
  引入版本；把一个不可证明的符号发出去，等于用"最老声明版本上崩溃"换一点整洁。
  *（需对 GNOME 45 人工确认后才可重议。）*
- **给 Escape 绑定做按键编辑器**：不做。libadwaita 的按键捕获控件有同样的不可证明问题，
  而手写一个意味着为了改一个加速器去新增脆弱私有 API 依赖。开关（D-041）已经覆盖用户
  真能说出口的那个需求："我不想让 Escape 被占用"。
- **解开 JS↔CSS 的像素耦合**（`CHROME = 232`、`budget*0.60`、`SCROLLBAR_ESTIMATE = 16`、
  `width: 650px`）：不做。把两侧统一意味着运行时去读 CSS 几何，而这正是本文件别处列为
  缺陷的主线程 IO。该做的已经改了（D-035）：每个常量旁边写明它镜像的是哪条 CSS 声明，
  并由 `test/repo.test.js` 从样式表现算卡片内容宽度、与 `extension.js` 里的字面量比对，
  两侧从此无法安静地各走各的。
