<p align="right"><a href="verification.md">English</a> | <a href="verification.zh-CN.md"><b>简体中文</b></a> · <a href="../../MAINTENANCE.zh-CN.md">维护手册</a></p>

# 验证：跑什么，以及它证明不了什么

内容拆自 `MAINTENANCE.md` §4、§6、§9、§14。L1 那两档依赖的隔离配方写在
[cost-measurement.zh-CN.md](cost-measurement.zh-CN.md)。

## 1. 测试矩阵

| 命令 | 耗时 | 覆盖 | 是否写状态 |
|---|---|---|---|
| `npm test` | 秒级 | `translation-helper.js` 导出、`destroy()` 完整性、GLib 与 node 加密已知答案对撞、`prefs.js` 布局、仓库级守卡（`test/repo.test.js`：双语配对、调用点清单、服务商注册表、主线程不碰磁盘、JS↔CSS 几何契约、出厂默认值与设置文案对撞、翻译目录覆盖率——模板**与**三份 locale 都要覆盖、译者提示必须落到条目上） | 不写 |
| `npm run integration` | 约 2–4 分钟 | 真实无头壳：ACTIVE、面板按钮、弹窗结构、双击拷贝行为 | 不写（内存后端） |
| `npm run perf [cost\|idle\|all]` | 2 / 4 / 5 分钟 | 单次事件成本与空闲 CPU/RSS | 不写；JSON 落在 `~/.cache/fast-translate-perf/` |
| `npm run check:log` | 秒级 | 记录本身：`D-###` 唯一且连续无洞、代码提交被引用且哈希可解析、任何被 tracked `.md` 引用的 `D-###` 都有对应条目、每条五个字段齐全、`kind` 在允许集合内 | 不写 |

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
  [shell-internals.zh-CN.md](shell-internals.zh-CN.md) 里的 `_PID=` 过滤。
- 读本扩展自己的键要带 schema 目录：
  `GSETTINGS_SCHEMA_DIR=$PWD/schemas gsettings get org.gnome.shell.extensions.fast-translate <key>`。
- 四件事只能真机手工验：浅/深色实时切换后的弹窗、Esc、多显示器定位、以及翻译延迟
  （它受网络支配）。

## 5. 回滚与提交纪律

一次提交只管一件事，格式为 `type: 中文摘要`。上面每个步骤都是独立提交，
`git revert <sha>` 就精确退掉一个。`git push` 每次都需要明确决定；历史永不 rebase、
永不改写。
