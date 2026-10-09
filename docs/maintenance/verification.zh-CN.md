<p align="right"><a href="verification.md">English</a> | <a href="verification.zh-CN.md"><b>简体中文</b></a> · <a href="../../MAINTENANCE.zh-CN.md">维护手册</a></p>

# 验证：跑什么，以及它证明不了什么

内容拆自 `MAINTENANCE.md` §4、§6、§9、§14。L1 那两档依赖的隔离配方写在
[cost-measurement.zh-CN.md](cost-measurement.zh-CN.md)。

## 1. 测试矩阵

| 命令 | 耗时 | 覆盖 | 是否写状态 |
|---|---|---|---|
| `npm test` | 秒级 | `translation-helper.js` 导出、`destroy()` 完整性、GLib 与 node 加密已知答案对撞、`prefs.js` 布局、仓库级守卡（`test/repo.test.js`：双语配对、调用点清单、服务商注册表、主线程不碰磁盘、JS↔CSS 几何契约） | 不写 |
| `npm run integration` | 约 2–4 分钟 | 真实无头壳：ACTIVE、面板按钮、弹窗结构、双击拷贝行为 | 不写（内存后端） |
| `npm run perf [cost\|idle\|all]` | 2 / 4 / 5 分钟 | 单次事件成本与空闲 CPU/RSS | 不写；JSON 落在 `~/.cache/fast-translate-perf/` |
| `npm run check:log` | 秒级 | 记录本身：`D-###` 唯一且连续无洞、代码提交被引用且哈希可解析、任何被 tracked `.md` 引用的 `D-###` 都有对应条目、每条五个字段齐全、`kind` 在允许集合内 | 不写 |

`npm test` **不覆盖** `extension.js` 的运行时（约 2400 行）：纯 Node 下它根本加载
不了，因为 `gi://` 不可用。运行时路径只有 `npm run integration` 会走。

`test/prefs-validator.js` 只是冒烟测试 `fillPreferencesWindow()` 不抛异常，对控件
绑定、凭据分组都不断言。它还需要显示器以及 GTK4 与 libadwaita 的 typelib，这正是
它只作为本地桌面门、被刻意留在 CI 之外的原因。

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
| 文档约定成立 | 双语对在某节数量或顺序上漂移，或某份被跟踪的 markdown 用了任务复选框 | ——（配对规则放宽到全目录时已经确立） |

这些逼迫动作换来两条规则：

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
