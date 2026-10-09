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

- **RTL 属未验证，不是已修复。** 从 `libst` 里读不到 `text-align` 的取值表，Yaru 的
  CSS 也没有可参照用法，因此 St 是否接受 `text-align: start` 是未知的。警告标签仍
  保持 `left` 对齐，标题在 RTL 语言对里也仍指向 `➜`。在证明该取值被接受之前不要改。
- **各区域用自己的上限之后，dest 面板是否还有多余空白未经测量。** 原缺陷是十几像素
  的空白而非功能故障，在壳里断言它等于复刻私有布局推算，所以没有加专门测试；现有
  套件只能证明无回归。真机上目的地面板是否仍留空白需要人眼确认。
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
- D-021 新增的词性 `_()` msgid 尚未进入 `po/`（缺 gettext）——今天无副作用，与整个
  目录一致（没有任何 `.mo` 文件）。
- `po/` 在这台机器上无法重生成（缺 gettext）。

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
- `test/prefs-validator.js` 只断言 `fillPreferencesWindow()` 不抛异常。它的 settings mock
  只实现了 `get_key`、`get_range`、`get_enum`、`set_enum`、`connect`、`bind`、`get_strv`，
  别的一个没有，所以任何调用其他 `Gio.Settings` 方法的 `prefs.js` 会**先在这里**失败——
  这正是它的用途，但也意味着行、副标题、默认值、恢复默认这些行为在 L0 层毫无覆盖。

## 5. 已延后的缺陷与它们现在的状态

2026-10-09 决定：那一轮只做稳定性与结构，所以下面这批隐私与设置类缺陷是被记录而不是
被修好。每条都是读代码核实过的，不是推断。后来修好的那些连记录一起留在这里，
免得查清它们的过程失传。

- **后台模式下翻译失败完全没有任何反馈。** `extension.js:721` 的内联错误路径要求
  `!isBackground`，而 `fail()` 只在 `notifications` 为真时才调 `Main.notify`，该键的
  schema 默认值是 **false**。用默认配置，失败时什么都没发生。
- **后台成功的 toast 把用户自己的文本写进通知。** `extension.js:687` 用标题
  "Translated" 调 `Main.notify`，正文是 `requestText + " → " + toText`——原文与译文
  一起进了通知正文，而通知正文也会显示在锁屏上。这与本仓自己的隐私立场相冲突。
- **prefs 对文本发往何处一字不提。** 没有任何用户可见的说明告诉用户"被拷贝的文本会
  离开这台机器"、发给哪家服务商。此外单个词无论选什么都送去 Google（见上面第 3 节），
  同样未披露。*已决定：只披露——不加新开关、也不收窄（收窄会让词典卡回归失效）。*
- **完全没有"恢复默认"的入口**（`grep reset prefs.js` → 无）。
- `prefs.js:306-319` 的 "Project Homepage" 指向
  `github.com/tazztone/translate-assistant`，而 `metadata.json` 的 `url` 指向本 fork——
  这是打包进设置窗口的一处自相矛盾。About 页也没有许可证一行。
- 六个 `Adw.EntryRow`（DeepL URL、DeepL key、百度 appid/secret、有道 appid/secret）没有
  大白话副标题，而 23 行里有 14 行是有的。
- `keybinding-close-floating-window` 是活的（`extension.js:49`、`:384`），但没有出现在
  prefs 里；要暴露它实际上需要一个按键编辑器控件。
- **`updateServiceVisibility()` 曾硬编码 `service === 0/2/3`**（今天在
  `prefs.js:336-353`），把 `PROVIDERS` 表在第二个文件里重抄一遍：追加或调整服务商，
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

## 6. 已评估并判定不值其成本（只在新证据面前重开）

- **`St.ScrollView` → `St.Clip`**：不做。`St.Clip` 没有滚动条也没有惯性滚动，而这两处
  调用点与已实测的高度/上限修复纠缠在一起，为零用户可见收益去动它们会危及那些修复。
- **把弹窗重写成原生样式类 + 命名颜色**：暂不做。这些面板颜色是从 Yaru 手抄进
  `stylesheet-light.css` / `stylesheet-dark.css` 的常量；一轮完整的主题化会撞上
  `INVARIANTS.md` 里那条"全 shell 作用域 CSS"的危险，并把每一项弹窗测量重新打开。
- **把 `⇄`、`➜` 和旗子 emoji 语言标签换成 symbolic 图标**：暂不做。`➜` 同时是第 2 节里
  未决的 RTL 问题；旗子 emoji 住在 27+28 个 schema 枚举 nick 里，改它们等于为了外观去动
  schema。
- **解开 JS↔CSS 的像素耦合**（`CHROME = 232`、`budget*0.60`、`SCROLLBAR_ESTIMATE = 16`、
  `width: 650px`）：不做。把两侧统一意味着运行时去读 CSS 几何，而这正是本文件别处列为
  缺陷的主线程 IO。该做的已经改了（D-035）：每个常量旁边写明它镜像的是哪条 CSS 声明，
  并由 `test/repo.test.js` 从样式表现算卡片内容宽度、与 `extension.js` 里的字面量比对，
  两侧从此无法安静地各走各的。
