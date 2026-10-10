<p align="right"><a href="verification.md">English</a> | <a href="verification.zh-CN.md"><b>简体中文</b></a> · <a href="../../MAINTENANCE.zh-CN.md">维护手册</a></p>

# 验证：跑什么，以及它证明不了什么

内容拆自 `MAINTENANCE.md` §4、§6、§9、§14。L1 那两档依赖的隔离配方写在
[cost-measurement.zh-CN.md](cost-measurement.zh-CN.md)。

## 1. 测试矩阵

| 命令 | 耗时 | 覆盖 | 是否写状态 |
|---|---|---|---|
| `npm test` | 秒级 | `translation-helper.js` 导出、`destroy()` 完整性、GLib 与 node 加密已知答案对撞、`prefs.js` 布局、仓库级守卡（`test/repo.test.js`：双语配对、调用点清单、服务商注册表、主线程不碰磁盘、JS↔CSS 几何契约、出厂默认值与设置文案对撞、翻译目录覆盖率——模板**与**三份 locale 都要覆盖、译者提示必须落到条目上、任何脚本都不许打印设置值），以及文档门（`test/docs-lint.mjs`：每份 `*.md` 里每条相对链接与 `#锚点` 都必须解析得到，并带下限让空扫描不可能通过） | 不写 |
| `npm run integration` | 约 2–4 分钟 | 真实无头壳：ACTIVE、面板按钮、弹窗结构、双击拷贝行为、D-047 的两项 `St` 度量 | 不写（内存后端） |
| `npm run perf [cost\|idle\|all]` | 2 / 4 / 5 分钟 | 单次事件成本与空闲 CPU/RSS | 不写；JSON 落在 `~/.cache/fast-translate-perf/` |
| `npm run check:log` | 秒级 | 记录本身：`D-###` 唯一且连续无洞、代码提交被引用且哈希可解析、任何被 tracked `.md` 引用的 `D-###` 都有对应条目、每条五个字段齐全、`kind` 在允许集合内 | 不写 |
| `gjs -m test/l2-prefs-dump.mjs apps\|tree <名字>` | 秒级 | 通过 a11y 总线读**真实会话**里渲染出来的窗口——frame、标签、开关连同 `VISIBLE`/`SHOWING`/`SENSITIVE`（GNOME 50 上代理拿不到截图）。绝不打印可编辑字段的值。需要桌面会话：不在 `npm test` 里，也不进 CI | 不写 |

`npm test` **不覆盖** `extension.js` 的运行时（约 2400 行）：纯 Node 下它根本加载
不了，因为 `gi://` 不可用。运行时路径只有 `npm run integration` 会走。

`test/prefs-validator.js` 为**每个服务商**渲染一次 `fillPreferencesWindow()`，断言的
是窗口*显示什么、做什么*：某行的副标题点名了该服务商实际发送文本的端点（非 Google
服务商还必须同时点名 `clients5.google.com`，因为单词词典查询走那里）；恢复/清除行
共 7 条都在；第一次点击恰好重置四个分区自己的键集且一条密钥都不擦，确认点击把三个
凭据分组各清一次；Escape 开关关闭时写入空 `strv`、再开时还原它摘掉的那个绑定，并且
一次"关→开"往返后 `<Primary>Escape` 这种自定义绑定仍在。它仍需显示器以及 GTK4 与
libadwaita 的 typelib，所以只是本地桌面门，被刻意留在 CI 之外。它的边界就是那份 mock
的边界：`Gio.Settings` 是假的，所以真实 schema 里并不存在的键名在这里照样通过；控件
树只能靠 `get_first_child()` 走，因为这个 binding 不暴露页面列表。

## 2. 证据层级

**`CHANGELOG.md` 使用的层级名**按"结论需要什么环境"定义，不按工具定义：

- **L0** —— `npm test`：完全不需要壳。
- **L1** —— `npm run integration` / `npm run perf`：私有总线上的是一次性无头壳。
- **L2** —— 真机会话（见下面第 4 节）：本仓没有任何东西能把它自动化。

每条结论都要说明它由哪一层支撑。没有层级的"已验证"不算结论。一条检查如果从没见过
它失败，就没有证据说明它检查了任何东西：每条新守卫都要被触发失败一次（把断言写在
代码之前，或者在临时运行里破坏它守护的对象，然后再恢复）。

两条推论，各来自一次真实失误：

- **脱离生产调用链的测量，证明不了任何功能。** D-028 的反向词典补查是拿一个独立的
  `Soup.Session` 探针"实测"过的，那个探针自己传了 method；而生产代码走的是一个不返回
  method 的 builder——`Soup.Message.new` 抛异常，调用方的 catch 把它吞掉，于是这个功能
  从来没有发出过任何请求。验证要**走用户真正跑的那条代码路径**，或者原样复现该路径传的
  那一组参数。
- **harness 自己的收尾绝不能决定判决。** `set -e` 下 EXIT trap 会在第一条失败命令处中断，
  而 trap 的状态码会**顶替**真实结论：一套断言已经打印 `success:true` 和通过横幅，最后却以
  1 退出，原因只是清理删不掉自己的临时树。所以每个清理步骤都是 `|| true` 且显式用
  `/bin/rm`（详见 [cost-measurement.zh-CN.md](cost-measurement.zh-CN.md) 的陷阱清单）。

## 3. `test/eval-test.js` 里的脆弱断言

改弹窗结构前先 grep 锚点；行号会漂。

| 锚点 | 钉住的东西 |
|---|---|
| `menuItems.length !== 1` | 面板菜单只有 Settings 一项 |
| `w._copyBtn.opacity !== 110` / `!== 255` | 复制按钮禁用态/可用态外观 |
| `_destLabel.style_class.indexOf('error')` | 错误样式既要是加上，也要在重试后清掉 |
| `children.length < 6` | 窗口 actor 的子节点数量 |
| `children[0]` / `children[5].get_children()[0]` | header 是第一个子节点；动作行是 6 个，其中复制按钮排第一 |
| `style_class !== 'translate-floating-overlay'` / `'...-window'` | 类名字符串**全等**——再追加第二个类就会让测试失败 |
| `wantBg` 深色 `0x36363a` / 浅色 `0xffffff` | 变体样式表确实生效 |
| `padTop !== 24` | 证明 `stylesheet-base.css` 通过 `@import` 加载成功 |
| overlay 与 work area | 弹窗覆盖的是自己显示器的 work area，不是整个 stage |
| `_currentTarget.indexOf('same')` | 同语言的卡片必须带解释——它耦合的是**英文 msgid**，翻译这句话会让断言失败 |
| ⇄ 之后 `armCalls === 0` | swap 路径必须重新挂 12 秒看门狗 |
| `_dismiss()` 后 `w.overlay.reactive !== false` | 被关掉的遮罩必须立刻停止吞点击 |
| 等 800ms 后 `w._winDestroyed` | 销毁不能只依赖动画回调（无头环境永远不完成） |
| Test 3i 先 `fired === 1`、`destroy()` 后 `fired === 0` | 词典补查确实挂上了真实的看门狗，而 `destroy()` 把它摘掉了。之所以用行为证明，是因为 `GLib.source_exists` **在 GJS 里没有绑定**，存活与否只能看 6 秒到点时回调会不会发生 |
| Test 5 的 `synthStolen >= 1`、`cardStolen === synthStolen`、`synthStolen <= 16` | 竖向滚动条真的会拿走宽度（实测 8px），而且生产卡片与一只普通 `St.ScrollView` 在这个数字上一致；`SCROLLBAR_ESTIMATE` 仍然是"够cover"的那一侧。逼红方式是把上限收到 4：`a vertical scrollbar withholds 8px, more than SCROLLBAR_ESTIMATE (16) covers` |
| Test 5 的 `center === 1 && right === 2`，再 `start(LTR) === banana`、`start(RTL) !== right` | 先证明对齐读取器分得出取值，再钉住 `start` 不是方向相关的那个结论。逼红方式是把第一个比较翻成 `===`：`text-align start/end changed behaviour: start gives 0 under LTR and 0 under RTL…` |

### 已生效的请求前置守卫

每条判定都是 `translation-helper.js` 里的纯函数，既在 Node 里做单元测试，也在壳内
被真实触发（`test/eval-test.js` 的 Test 3b–3h）：

| 纯函数 | 挡住的问题 |
|---|---|
| `swapLanguages` | ⇄ 把 `AUTO` 放进目标槽——没有服务商接受，且污染会持续到用户改动设置 |
| `safeTruncate`、`codePointLength` | `slice(0, limit)` 切半代理对 → `URIError` 被原样显示成 "Error: URI malformed"；以及 emoji 被数成两个字符 |
| `isSameLanguage` | 花一次网络往返把原文原样还回去（只在两码完全相等时拦截：`EN-GB -> EN-US` 是正当请求） |
| `hasVisibleText` | `trim()` 覆盖不到 U+200B–U+200F 与 U+2060，于是一串不可见字符也会发出请求 |

`_dismiss()` 另外会置 `_userDismissed`，用来阻止晚到的译文在用户已经关掉卡片后
仍改写剪贴板；后台模式不受影响，因为它根本不显示卡片。

**`swapLanguages` 现在经 `onSwap` 进入生产**（D-032）。它曾经是 `onSwap` 里的一份
内联副本，而 Node 那条测的是 helper——断言因此是装饰性的。所以 `test/repo.test.js`
现在把本表每条判定列成清单，并逐条断言 `extension.js` 里有它的调用点：重新写回一份
内联实现，清单变红；删掉 helper 又不把它的断言下沉到 L1，同样变红。

### `test/repo.test.js` 的仓库级守卡（L0，不需要显示器）

它们检查的是运行时看不见的事，因为失败方式是*一份文档或一个常量过期*，而不是一处
行为坏掉：

| describe | 什么时候失败 | 怎么把它逼红 |
|---|---|---|
| 一条守不住"生产真正走的那条分支"的守卫 | 被 L0 钉住的 helper 不再被 `extension.js` 调用 | 删掉 `swapLanguages` 的调用点（红：5 条里 1 条） |
| 设置窗口读的是服务商注册表，不是枚举整数 | `prefs.js` 又硬编码 `service === 0/2/3`，或不再 import `getProvider` | 把一条诱饵 `service === 2` 写回 `prefs.js` |
| 主线程不碰磁盘 | active 图标不再随仓库存在，或 `extension.js` 里出现了 `.query_exists(` | 往 `_get_icon()` 注入一条真实的 `probe.query_exists(null)`（红：10 过 / 1 败）；控制组：同样这句话写进注释行必须仍是绿的 |
| 弹窗的几何常量仍与它镜像的 CSS 一致 | 卡片宽度 / padding / border / spacing / divider / actions margin 变了，而 JS 里的算术没跟上 | `width: 650px`→`700px`；深色 `border: 1px`→`2px`；`spacing: 16px`→`12px`。控制组：往同一条规则加 `min-width: 600px` 不应变红 |
| 出厂默认值守得住设置文案许下的承诺 | `notifications` 默认又回到 false（后台模式失败既无卡片也无通知）、`floating-background-toast` 默认回到 true（它那一行写的是"静默"）、或 Escape 键的默认值里不再有 `Escape`（那个开关就会写错绑定） | 三处逐条单独改工作树里的 schema：`notifications` true→false（`expected: true / actual: false`）、`floating-background-toast` false→true、CDATA `[['Escape']]`→`[['']]`。控制组：不改 → 绿。每次改完都按字节还原，`git status` 显示 schema 是干净的 |
| 翻译目录覆盖了代码请求翻译的串 | `extension.js` / `prefs.js` / `translation-helper.js` 里某个 `_()` 字面量不在 `po/messages.pot` **或**不在 de/es/nl 任一份里；某份目录带着模板已经不认识的 msgid；源码里某条 `// Translators:` 注释没有以 `#.` 落到条目上；目录里的提示与源码写的不是一回事；或抽取正则失效（下限：msgid 要 > 50，提示要 ≥ 10） | 目录覆盖：把 `po/messages.pot` 里一条 msgid 改名 → 红，随后还原。locale 覆盖与提示落地：这两条是**在目录同步之前**写的，所以自己就红了（`13 "Translators:" comment(s) never reached po/messages.pot`，外加每个 locale 各一条），条目和提示补齐后转绿。防空转：把**未经修改的同一份守卡**跑在一个三处源文件为空壳的临时目录树上 → 红，报 `only 0 msgid(s) extracted — the _() matcher stopped working, so this guard is checking nothing` |
| 任何目录都不许把同一条 msgid 定义两遍（obsolete 也算） | `po/messages.pot` / de / es / nl 里任何一条 msgid 出现两次——**包括以 obsolete `#~ msgid` 出现的那次**——因为 `msgfmt` 会判 `duplicate message definition` 并 exit 1，而 `gnome-extensions pack --podir=po` 和 `msgmerge` 跑的都是它（下限：每份至少解析出 180 条 msgid，解析器坏了不许过关） | 先写守卡、再对着真实缺陷跑红：`3 duplicate msgid(s) — msgfmt will exit 1 on each of these files: po/de.po: "License" at :500 and :961`（es/nl 同样一对），行号与 msgfmt 自己打印的完全一致。控制组：把三份里那对 obsolete 删掉即转绿（40 条断言），而那三份里**仍然留着 125 条不冲突的 obsolete 条目**（47/31/47），可见这条守卡不是见 `#~` 就判红 |
| 打包清单发的就是仓库里有的 | 某个根级 `.js`/`.css` 不在 `scripts/pack.sh` 的暂存行里；或被暂存了却没有 `--extra-source=` 行（也不属于 `gnome-extensions pack` 自带的四个文件名）；或脚本点名的路径仓库里已经没有；或 `mkdir -p`/`cp -r` 排在了 `rm -rf /tmp/fast-translate-pack` 之前；或 `command -v msgfmt` 检查被挪到 `rm -f *.zip` 之后（下限：暂存名 ≥ 10、extra-source ≥ 6、根级源文件 ≥ 7） | 八份 `tar` 副本、每份只改一件事，另有一份未修改的对照副本保持绿色：新增根级 `newmod.js` → "被暂存"和"被点名"两条同时红；只暂存不加 `--extra-source` → "被点名"；往 `cp -r` 行加一条 `ghostmodule.js` → "已经离开的仓库"；删掉 `rm -rf`、以及把它换到 `mkdir -p` 之后 → "先清空再填"；msgfmt 检查块挪到 `rm -f *.zip` 下面、以及整块删除 → "在上一个 zip 被删之前"；把该行改成 `cp -a` → 下限红，而且**这一轮有两条内容守卡仍是绿的**，这正是下限存在的理由 |
| schema 自己那些可翻译的串要进到每份目录 | 任何 `schemas/*.gschema.xml` 里的 `<summary>`/`<description>` 不在 `po/messages.pot` 或 de/es/nl 里；`<schemalist gettext-domain>` 不再等于 `metadata.json` 的 `gettext-domain`；或 XML 读到的元素比开标签少（下限：解析出的 schema 串 > 40，外加那条开标签自检） | 先写断言、在那条真缺陷上跑红——`is missing 15 of 48 schema msgid(s)`，点名的正是百度/有道/面板图标/Escape 那些串——15 条落地后转绿（`# pass 42 / # fail 0`；开标签自检是逼红时才补的，所以套件现在是 43）。随后在 `tar` 副本里再逼红三种，另有一份未修改的对照副本保持绿：改 `metadata.json` 的 domain → 只有那条 domain 红；从四份目录删掉 `msgid "Show panel icon"` → `is missing 1 of 48`；把一条 `<summary>` 拆成三行 → `holds 48 opening tag(s) but the reader collected 47`；删掉 30 个元素 → `only 18 schema string(s) parsed`。最后这一种是**改 schema** 把集合清空——正是下限要挡的假绿 |
| 文档约定成立 | 双语对在某节数量或顺序上漂移，或某份被跟踪的 markdown 用了任务复选框 | ——（配对规则放宽到全目录时已经确立） |
| probe 只把设置库当哈希读 | 仓库里任何 `.sh`/`.js`/`.mjs`/`.cjs` 跑了 `dconf dump`/`dconf read` 或 `gsettings get`/`list`，也就是打印设置**值**（本 schema 的 6 个字符串键每一个都可能装着服务商凭据）；或扫描不再覆盖 `test/integration.sh` 与 `test/perf-probe.sh`（下限：这两个文件必须在扫描里，可执行文件 ≥ 10） | 在仓库的一次性副本里（`tar` 过去、不带 `.git`、入口模块是真文件）：往 `test/integration.sh` 追加一条**可执行的** `dconf dump /org/gnome/shell/extensions/fast-translate/` → `not ok — test/integration.sh reads a settings value…`；另在 `test/perf-probe.sh` 里放一条 `gsettings get … apikey` → 同一条消息点名那个文件。控制组：**同样这两行**前面加 `#` 变注释必须保持绿（33 pass / 0 fail），还原后的树也是绿 |

本轮逼过的，以及仍然只是"写好了、没见过它失败"的：

- `test/unit.test.js` 里的 `PROVIDERS.host` 对撞：把 `translation-helper.js` 的一份**副本**
  上四条 `host:` 字段全部剥掉，再让未经修改的正式测试跑在那份副本上 → `exit=1`，
  `every provider must declare a host, even if only to say it has none`（`test/unit.test.js:228`）；
  把真实 helper 放回同一位置就是绿色控制组。临时副本必须是**真实文件**：Node 会把入口模块的
  符号链接解析回它在仓库里的真实路径，于是 `../translation-helper.js` 又指回生产代码，实验什么
  也没证明——第一次尝试正是这样，结果假绿。
- **没逼红的**：prefs 校验器的主机名披露断言、两遍重置/清除计数、以及 Escape 的 `strv` 往返。
  它们是照着已经发出去的代码补的，所以只被*看见通过过*。曾想在临时目录里把
  `serviceRow.subtitle` 写死再跑校验器，被拦下了，所以这条仍然敞着：
  *(needs manual confirmation——在被当成守卡信任之前，每条都要先逼红一次。)*

这些逼迫动作换来的规则：

- **守卡量的必须是代码，不是散文。** `query_exists` 那条守卡最初匹配到解释"该调用已
  删除"的注释，于是把修复本身报成缺陷。凡是「这个调用不存在」形式的断言，现在都跑在
  `srcCode()`（先剥掉整行注释）上，并匹配调用形状 `.query_exists(` 而不是裸函数名。
  `min-width` 不能顶替 `width`：读声明要带前导边界。
- **文档里每个 `file:line` 锚点都是一条会过期的断言。** 任何增删 `extension.js` 行数
  的改动之后都要重算：扫 `docs/` 与根目录 `*.md`，取出所有 `name.js:NNN` 与续引
  `` `:NNN` ``，打印那一行，确认它仍然是被引用的那个构造。本轮：走过 138 个锚点，
  `shell-internals` 表里 14 行重新定位（C1–C5 把 `extension.js:1316` 之后全部挪了位），
  3 处过期的 `prefs.js` 区间已修正。`docs/reports/AUDIT.md` 是其提交时点的快照，
  按约定不参与重编号。
- **手写"本该由生成器产出"的文件，等于自己重实现生成器的每条规则，所以每条都得单独量。**
  在没有 gettext 的情况下改 `po/`，连着犯了三个错，都靠"复检产物而不是相信脚本"才被抓到：
  行号取自**剥掉注释之后**的源码，于是整体平移（有一条引用指到了只是把 `"Cancelled"` 写在句子里
  的注释行，而不是 `extension.js:1262` 那个真正的调用）；手写的长 msgid 折行**把空格吃了**——
  gettext 拼接相邻字符串时不会补空格（每个 locale 因此坏了 16 条 msgid）；提示写成 `#.text`
  而不是 `#. text` 根本不算提示，守卡自己的 `^#\.\s` 就没匹配上。规则：模板里已有的行就
  **逐字复制**；改完之后重新数一遍（`msgid`、`msgstr`、`#:`、`#.`），而且模式**必须转义**——
  grep 里不转义的 `^#. ` 会把每一条 `#: ` 也算进去，这正是有一份正确的目录短暂被读成"有 317
  条提示"的原因。
- **gettext 装上之后，就用它数，别再拿 grep 数。** 目录的权威计数来自 `msgfmt --statistics`、
  `msguniq`、`msgcomm`、`msgunfmt`。我自己写的按行读取器会少数，因为长 msgid/msgstr 会续行：
  一份 189 条的目录被读成 181 条；`grep -c '^msgstr "[^"]'` 说 es 有 56 条译文，而 gettext 说
  是 63 条（34 translated + 29 fuzzy）——D-044 记的就是那个 grep 的数，差的正好是那些跨行条目。
  另外两件事只有工具会告诉你：`.mo` 会把空 msgstr **和** fuzzy 两类都排除在外；`msgfmt` 会把
  obsolete 的 `#~ msgid` 与活条目算成重复。这个坑不止坑计数：用 `f'msgid "{text}"' in open(目录).read()`
  做成员判断，报出 **21** 条 schema 串"不在目录里"，而会拼续行的读取器和 `msgcomm` 都说 **15** 条——
  多出的 6 条全是 gettext 写成 `msgid ""` 再加续行的长串。要么问 gettext，要么自己把续行拼上，
  **不要拿字符串去搜目录原文**。
- **"这台机器观察不到"本身也是一条需要证据的说法。** 一个检查返回阴性时，先证明仪器原本看得见阳性。
  2026-10-10 问"有没有什么东西会翻译 GSchema 的 `<summary>`/`<description>`"时，三个正控全都因为
  **仪器**原因失效，而每个失效都能打出来：`locale -a | grep -c '^de'` → 0（于是
  `LANGUAGE=de … gettext -d apt '  Candidate: '` 打印英文 msgid，而对**同一个** `.mo` 用
  `gettext.GNUTranslations` 拿到的是 `  Installationskandidat: `——文件没问题，路径是死的）；
  `/usr/bin/gettext` 是 glibc 那个，`TEXTDOMAINDIR` 和 `LOCPATH` 都不认（4 种组合，答案一样）；
  系统里压根没装 `gsettings-desktop-schemas.mo`。第四个坑：apt 那条 msgid 带**两个前导空格**——
  拿去掉空格的写法去查，一条真实存在的译文看起来就像不存在。
- **要读一份不在系统 localedir 里的 schema，用 `XDG_DATA_DIRS` 把 glib 指过去**，而不是往系统装东西：
  把 `.gschema.xml` 和一次 `glib-compile-schemas` 的产物放在 `<临时目录>/glib-2.0/schemas/`，然后
  `XDG_DATA_DIRS=<临时目录> gsettings describe <schema> <键>` 就能读到，`gsettings list-keys` 证明这个
  source 活着。这是不需要桌面、也不往 `/tmp` 之外写任何东西的 schema 文本读法（上面那条问题就是靠它
  问清楚的：题面问的是编译期开关，而 `glib-compile-schemas --gettext-package=foo` 在 2.88.0 上是
  `Unknown option`、exit 1——**同时**二进制里还有 `dcgettext` 和
  `l10n requested, but no gettext domain given` 这条串，所以"开关没了"绝不能写成"翻译不可能"）。
- **取证手段本身可能就是错的仪器。** 零写入这条性质一向用 `sha256sum ~/.config/dconf/user`
  前后对比，而且必须在断言它的那一条命令里成对取证。本轮有一对临时前后对照打印的是设置库的
  *内容*而不是它的摘要——这个方法会把这个 schema 的 6 个字符串键（`apikey`、
  `baidu-appid`/`baidu-secret`、`youdao-appid`/`youdao-secret`、`url`）写进运行被重定向到的任何
  日志里。至于到底有没有落到磁盘上，**已经无法复核**：本轮的临时文件都删掉了，而为了搜索它再把
  密钥读出来，本身就违反这条规则。所以这里既不主张"密钥泄漏了"，也不主张"什么都没泄漏"——主张的是：
  当你要证明的是"没变"，打印值就不是正确的取证工具。该次运行自己的日志查过，里面没有凭据值
  （`apikey|secret|appid` 命中的 3 处全是 `org.freedesktop.secrets` 的 D-Bus 噪声），那对证据已改用
  摘要重新取证，并且现在仓库里任何脚本都不许再跑 `dconf dump`/`read` 或 `gsettings get`/`list`——
  这条进了守卡。

## 4. 真机会话验证

- `scripts/reload.sh` 只做 disable+enable。GNOME 50 上这**不会**重新 import 改过的
  `extension.js`（ESM 模块缓存是进程级的），所以它永远验证不了代码改动。要重启
  壳——Wayland 下意味着注销再登录。
- 日志：`journalctl -f -o cat /usr/bin/gnome-shell`，或按
  [shell-internals.zh-CN.md](shell-internals.zh-CN.md) 里的 `_PID=` 过滤。一定要把该 PID 的
  总行数一起打出来：`0` 行错误只有在"这段时间确实有日志"时才是证据（2026-10-10 实测：
  111 行日志、0 条错误——这就是这条检查的防空转下限）。
- **壳自己的扩展 API 不用 unsafe-mode、不用 Eval 就能回答 L2 问题。** session bus 上的
  `org.gnome.Shell.Extensions` 提供 `GetExtensionInfo(uuid)`（返回 `state`、`version`、
  `error`）、`GetExtensionErrors(uuid)`（返回字符串数组）和 `UserExtensionsEnabled` 属性。
  本机自己标定过：`enabled-extensions` 里每个 uuid 都报 **`state=1`**，装了但没启用的报
  **`state=6`**，不存在的 uuid 直接出错——所以"1 = ACTIVATED"是从机器上读来的，不是假设。
  `version` 是"跑着的代码就是提交里的代码"的现场证据（07:47 重启后为 `16.0`），而
  `GetExtensionErrors` 返回 `[]` 是壳自己的错误收集器认可"加载没抛异常"。
  `UserExtensionsEnabled=true` 则是 `/run/user/1000/gnome-shell-disable-extensions` 那个顾虑
  的现场对照——安全模式没开。
- **代理拿不到截图。** GNOME 50 上 `org.gnome.Shell.Screenshot.Screenshot` 回
  `AccessDenied: Screenshot is not allowed`，而 `gnome-screenshot`、`grim`、`wf-recorder`、
  `spectacle` 本机一个都没有。于是所有*观感*结论（这行会不会折行、图标好不好看、卡片落在
  哪块屏）只能由维护者给；拿一条 D-Bus 回复就写成"已验证"是假主张。
- **看真 GTK 窗口的免像素仪器：a11y 树。** `Atspi-2.0.typelib` 加上在跑的 a11y 总线，可以让
  `gjs -m test/l2-prefs-dump.mjs apps|tree <应用名子串>` 遍历 `Atspi.get_desktop(0)`，把 frame、
  分组、标签、开关连同
  `VISIBLE`/`SHOWING`/`SENSITIVE` 打出来。**要读 `SENSITIVE`，不要读 `ENABLED`**——GTK4 的
  AT-SPI 桥压根不填 `ENABLED`，一个健康的窗口会对每个节点报 `ENABLED=false SENSITIVE=true`，
  相信 `ENABLED` 的代理会"发现"整个设置窗被禁用了。这点已经被另一个扩展的设置窗完整验证过
  （`[frame] "Burn-My-Windows 48"` 及其各子控件，402 个节点）。两条硬规矩，脚本里都写了：
  **绝不读
  `entry`/`password-text` 节点的文本**（本扩展的这些字段里装的是服务商密钥，只打标签），
  以及 prefs 宿主 `org.gnome.Shell.Extensions` **只允许一个窗口**——只要任何一个扩展的对话框
  还开着，`LaunchExtensionPrefs` 与 `OpenExtensionPrefs` 都会以
  `Already showing a prefs dialog` 失败，所以必须先关掉它（脚本会把这条提醒打出来）。我们自己的浮窗究竟会不会出现在
  a11y 树上**尚未观察过**：壳的树里只有 window/surface 那些 panel。它需要桌面会话，所以不在
  `npm test` 里，也不进 CI。
- **双击复制这条触发路径会毁掉剪贴板数据，所以由维护者来按。** 触发条件是
  `selection 'owner-changed'` 加上同一段文本在 50ms–2s 内被复制两次（`extension.js:299-360`），
  代理*确实*能用两次 `wl-copy` 假冒——但 `wl-copy` 只能还原 `text/plain`。本次会话里真实剪贴板
  还带着 `chromium/x-source-url`、`chromium/x-internal-source-rfh-token` 与 `text/html`，
  这些是还原不回来的。所以这一步是人工步骤，不是自动步骤。
- 读本扩展自己的键要带 schema 目录：
  `GSETTINGS_SCHEMA_DIR=$PWD/schemas gsettings get org.gnome.shell.extensions.fast-translate <key>`。
  **要点名具体的键**——不要对这个 schema 跑 `gsettings list` 或 `dconf dump`（见第 3 节）。
  打开设置窗口本身不写任何东西；但**逐个走完四个服务商分组是要写的**：它设的是维护者真实配置里的
  `translation-service`，所以这是在他"有判断就用你的判断"的授权下做的取舍，而且必须以**改回并读回**
  收尾（本轮：`DeepL → Google → Baidu → Youdao → DeepL`，最后读回 `'DeepL'`，全程
  `GetExtensionErrors` 为空）。结果记在 `docs/reports/VERIFY.md`。
- 仍然只能靠真机手验的：浅/深色实时切换后的弹窗（切主题是**全局** GNOME 设置，代理不许动）、
  合上；那句披露长文在窄窗口里读不读得下去仍然只有人能给（树里没有几何）。

## 5. 回滚与提交纪律

一次提交只管一件事，格式为 `type: 中文摘要`。上面每个步骤都是独立提交，
`git revert <sha>` 就精确退掉一个。`git push` 每次都需要明确决定；历史永不 rebase、
永不改写。
