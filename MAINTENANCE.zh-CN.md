<p align="right"><a href="README.zh-CN.md">README</a> · <a href="MAINTENANCE.md">English</a> | <a href="MAINTENANCE.zh-CN.md"><b>简体中文</b></a></p>

# 维护手册

这是本 fork 的运维知识，不是用户指南——用户文档见
[README.zh-CN.md](README.zh-CN.md)。下面每一条都是在这台机器上实测或从 shell
源码里读出来的；没有实测过的统一标注 *(待确认)*。

## 1. 先读这一段

- **这个目录就是运行时的扩展目录**
  （`~/.local/share/gnome-shell/extensions/fast-translate@local`）。没有构建步骤，
  也没有独立的安装目标：改文件就是改正在运行的扩展，留在这里的多余文件可能被壳
  加载。绝不在本目录执行 `gnome-extensions install` 或 `gnome-extensions pack`
  （见 [AGENTS.md](AGENTS.md)）。
- 所有决策的优先级：**稳定性 > 性能 > 代码美观。**
- 唯一目标环境：**Ubuntu 26.04 + GNOME Shell 50.1 + Wayland。**用
  `gnome-shell --version` 和 `/etc/os-release` 核实过，不是假设。

## 2. 不变量：这些不要"顺手修正"

| 看起来像 bug | 为什么必须保持 |
|---|---|
| `gettext-domain` 是 `fast-translate@tazztone.github.io`，而 `uuid` 是 `fast-translate@local` | 编译出的 `.mo` 文件名必须与 domain 对齐，改了会静默失去翻译。 |
| 没有 `stylesheet.css`，只有 `stylesheet-light.css` + `stylesheet-dark.css` | `_loadExtensionStylesheet` 依次尝试 `${sessionMode}-${variant}.css`、`stylesheet-${variant}.css`、`${sessionMode}.css`、`stylesheet.css`，**命中第一个就停**。只有 `-light`/`-dark` 命名才会挂到 `notify::color-scheme` 的实时重载上。 |
| `shell-version` 列 `"45"`…`"50"` | 只比大版本，见 §8。没验证过就不要加新大版本。 |
| `metadata.json` 的 `url` 指向本 fork | 刻意为之：这是冻结上游的承接 fork。 |

不改写原型、扩展代码里不用 `imports.ui.*`、不注入 shell 内部函数、没有后台定时
器、没有自建 D-Bus 服务。所以任何失效的影响面只有本扩展自己，不会拖垮 shell 或
邻居 fork。

## 3. 依赖

全部由 GNOME 自带，无需新增任何东西。

| 依赖 | 本机版本 | 谁在用 | 缺失后果 |
|---|---|---|---|
| `gjs` | 1.88.0 | 宿主 | 加载不了 |
| `gnome-shell` | 50.1-0ubuntu1.2 | `ui/main.js`、`panelMenu`、`popupMenu`、St/Shell | 加载不了 |
| mutter 18（`Clutter-18`、`Meta-18`） | 随壳 | `Meta.SelectionOwner::owner-changed`、Clutter 事件/动画 | 双击拷贝失效 |
| **`libsoup3`**（`gi://Soup?version=3.0`） | 3.6.6 | 所有 HTTP 请求 | **整个功能失效** |
| GLib/Gio/GObject | 2.x | 含 `compute_checksum_for_string`、`compute_hmac_for_data`、`base64_encode` | 百度/有道签名失效 |
| Pango | 1.57.0 | 只用 `Pango.WrapMode` | 换行异常 |
| GTK4 + libadwaita | 4.22.4 / 1.9.1 | **只有 `prefs.js`** | 设置窗口打不开，**翻译照常** |
| 图标主题（Yaru/Adwaita） | — | 弹窗与 prefs 里 9 个 `*-symbolic` 名 | 按钮画成破碎图标 |

- `libsoup3` 是唯一显式钉版本的 import，也是最集中的单点故障。
- 面板图标是按**文件路径**从 `icons/` 读的（`Gio.Icon.new_for_string`），不依赖
  主题；只有弹窗和 prefs 的按钮图标来自主题。
- 没有任何 CSS 声明 `font-family`，字体继承 Cantarell/Yaru。
- **不**依赖：Python 或任何外部二进制（没有 `Gio.Subprocess`/`spawn`）、运行时
  的 `node_modules`、任何 D-Bus 服务，以及**任何文件持久化**——翻译缓存纯内存，
  `disable()` 即清。

## 4. 测试矩阵

| 命令 | 耗时 | 覆盖 | 是否写状态 |
|---|---|---|---|
| `npm test` | 秒级 | `translation-helper.js` 导出、`destroy()` 完整性、GLib 与 node 加密已知答案对撞、`prefs.js` 布局 | 不写 |
| `npm run integration` | 约 2–4 分钟 | 真实无头壳：ACTIVE、面板按钮、弹窗结构、双击拷贝行为 | 不写（内存后端） |
| `npm run perf [cost\|idle\|all]` | 2 / 4 / 5 分钟 | 单次事件成本与空闲 CPU/RSS | 不写；JSON 落在 `~/.cache/fast-translate-perf/` |

`npm test` **不覆盖** `extension.js` 的运行时（约 1900 行）：纯 Node 下它根本加载
不了，因为 `gi://` 不可用。运行时路径只有 `npm run integration` 会走。

`test/prefs-validator.js` 只是冒烟测试 `fillPreferencesWindow()` 不抛异常，对控件
绑定、凭据分组都不断言。

## 5. 无头 harness

`test/integration.sh` 与 `test/perf-probe.sh` 用同一套配方。**改配方必须同时改两
处。**

```
dbus-run-session  +  GSETTINGS_BACKEND=memory  +  XDG_DATA_HOME=<tmp>/data（符号链接到本仓库）
XDG_RUNTIME_DIR=<tmp>/runtime  +  --headless --wayland-display=wayland-<唯一名> --unsafe-mode
```

- 光有 `dbus-run-session` **不算写隔离**：dconf 写入由真实 `XDG_CONFIG_HOME` 服务，
  会落进 `~/.config/dconf/user`。让它真正不写的是 `GSETTINGS_BACKEND=memory`。这是
  安全属性而不是整洁问题——`eval-test.js` 会强制 set 本扩展 schema 的三个键。
- 内存后端下 `enabled-extensions` 是 schema 默认值（空），`gnome-extensions enable`
  传不到嵌套壳。所以由 `test/bootstrap.js` 走壳自己的 `_callExtensionInit` →
  `_callExtensionEnable`，顺带把样式表真实加载一遍。
- GNOME 50 上提供 `org.gnome.Shell.Eval` 的是 `--unsafe-mode`（不是 `--devkit`），
  且它不出现在 `--help-all` 里。
- **没有** Eval 的 shell 会返回 `(false, ...)` 且**退出码为 0**。所以要轮询回复里的
  `(true,`；只测退出码会立刻"成功"，然后静默把调用打到别的进程上。
- `ExtensionState`：`ACTIVE 1, INACTIVE 2, ERROR 3, OUT_OF_DATE 4, INITIALIZED 6`。
  `INITIALIZED` 表示对象已存在但 `extension.js` **尚未** import，`stateObj` 还是
  undefined；而 `createExtensionObject` 压根不设 `state`，所以轮询 `lookup(uuid)`
  是否为真值不够，要轮询 `state !== undefined`。
- 在 `bash -c '...'` 体内不能出现未转义的撇号：它会截断字符串，剩下的部分跑到外层
  shell 执行。这事真发生过一次，表现是一条莫名其妙的 `trap: usage`。
- 跑完检查有没有遗留的嵌套壳：`pgrep -af 'gnome-shell --headless'`。每个占约
  230 MB 和若干 CPU，而且会污染你自己的测量。

## 6. `test/eval-test.js` 里的脆弱断言

改弹窗结构前先 grep 锚点；行号会漂。

| 锚点 | 钉住的东西 |
|---|---|
| `menuItems.length !== 1` | 面板菜单只有 Settings 一项 |
| `w._copyBtn.opacity !== 110` / `!== 255` | 复制按钮禁用态/可用态外观 |
| `_destLabel.style_class.indexOf('error')` | 错误样式既要是加上，也要在重试后清掉 |
| `children.length < 6` | 窗口 actor 的子节点数量 |
| `children[0]` / `children[5].get_children()[0]` | header 是第一个子节点；动作行是第 6 个，其中复制按钮排第一 |
| `style_class !== 'translate-floating-overlay'` / `'...-window'` | 类名字符串**全等**——再追加第二个类就会让测试失败 |
| `wantBg` 深色 `0x36363a` / 浅色 `0xffffff` | 变体样式表确实生效 |
| `padTop !== 24` | 证明 `stylesheet-base.css` 通过 `@import` 加载成功 |
| overlay 与 work area | 弹窗覆盖的是自己显示器的 work area，不是整个 stage |
| `_currentTarget.indexOf('same')` | 同语言的卡片必须带解释——它耦合的是**英文 msgid**，翻译这句话会让断言失败 |
| ⇄ 之后 `armCalls === 0` | swap 路径必须重新挂 12 秒看门狗 |
| `_dismiss()` 后 `w.overlay.reactive !== false` | 被关掉的遮罩必须立刻停止吞点击 |
| 等 800ms 后 `w._winDestroyed` | 销毁不能只依赖动画回调（无头环境永远不完成） |

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

## 7. 实测成本基线

`npm run perf`，GNOME 50.1，隔离无头壳，2026-10-01。**无头是虚拟显示器上的软件
渲染，绝对值不能换算到真实会话**，只有相对结论站得住。1 tick = 主线程 10 ms CPU。

| 事件 | 实测 |
|---|---|
| 启动：import + 构造 | 2–3 ticks，约 21 ms wall |
| 启动：样式表加载 + `enable()` | 2 ticks，约 22 ms wall |
| 热启用（含被推迟的 idle） | 4–11 ticks，61–79 ms wall |
| disable | 1–2 ticks，11–28 ms wall |
| 构造一个 `FloatingTranslationWindow` | 4.83–4.86 ms |
| 翻译缓存打满（200 次 × 2000 字符） | 收敛到 `size=50`、125 350 字符，**+108…236 KB** |
| 一次剪贴板事件（同步部分） | 10–22 µs |
| 空闲 CPU | 见下 |

- **开关周期无泄漏。** 20 轮、每 5 轮采样：第 5 轮 `+4088 KB`，之后
  `2660 / 2448 / 2908 KB`，而且第 20 轮的绝对 RSS 比第 5 轮**还低**。这是分配器
  arena 爬坡后饱和，不是线性泄漏。早前这版探针一度报出可疑的 `+3 MB`，原因纯粹是
  循环前后的沉降时间不对称（前 6s 后 4s）——改这里时务必两侧相等。
- **空闲 CPU 处在分辨率极限。** 交替的 4 × 30s A/B/A/B 窗口跑两次：一次
  `启用 - 关闭 = +4.0 ticks`（组内波动 1），另一次 `+0.5`（波动 2）。诚实的说法是
  **0 – 0.13% 单核**，无法稳定与壳自身地板分离。之前"实测为零"的表述说过头了。
- **空闲 RSS 同样分不出来**：gc 后启用态对比未加载态，一次 `+1792 KB`，一次
  `-28 KB`。
- 无头测不到、但真正决定你体感延迟的两项：每次复制的 `Clipboard.get_text()`
  Wayland 往返，以及服务商的网络 RTT。

## 8. 小版本更新的失效面

GNOME 的版本闸门**只比大版本**——`extensionSystem.js` 的 `_isOutOfDate()` 是
`shell-version.some(v => v.startsWith(PACKAGE_VERSION.split('.')[0]))`。所以
`50.2`、`50.3`… 会**不带任何警告**地加载本扩展，真实不兼容只会以运行时 JS 错误
出现。在 Ubuntu 上，多数"小版本更新"其实是上游号不变、Ubuntu 修订号变并带着下游
补丁（`extensionSystem.js` 自己就有 `Desktop.is('ubuntu')` 分支）。

按命中概率排序，附你会看到的症状：

1. **剪贴板链路** — `global.display.get_selection()`、
   `Meta.SelectionOwner::owner-changed`、`St.Clipboard.get_text()`，加上
   50ms–2s 同文双拷判定。Wayland 剪贴板的 offer/owner 语义是 mutter 里改动最活跃的
   部分之一。已有特性检测兜底，最坏是触发**静默失效**，不会崩。
   *症状：面板图标在，双击 Ctrl+C 没反应。*
2. **`global.stage.connect('captured-event')`** 抓 Esc — Clutter 输入路由，只在弹窗
   打开期间挂。*症状：Esc 失灵。*
3. **`PanelMenu.Button` / `PopupMenu.PopupMenuItem` / `Main.panel.statusArea`** 以及
   变体样式表文件名约定。*症状：`enable()` 抛错、面板图标消失（只它自己）。若只是
   Yaru/Adwaita 改了类名，则纯属外观。*
4. **GI 绑定形状**，例如 `GLib.compute_hmac_for_data` 收 3 个参数（实测并写在
   `signing.js` 里）。*只影响百度/有道签名，DeepL 与 Google 不签名。*
5. **`prefs.js` 用到的 libadwaita 控件** — Ubuntu 会独立升 libadwaita。*症状：设置
   窗口打不开，翻译照常，可用 `dconf write` 绕过。*
6. **服务商改 API / 换域名** 比上面任何一条都更容易先坏，而且百度与有道的语言表还
   是 *(待确认)*，见 §13。

跨到 **GNOME 51** 是另一回事：直接 `OUT_OF_DATE` 完全不加载，直到往 `shell-version`
里加上 `"51"`。

分诊顺序：

```bash
gnome-extensions info fast-translate@local          # 期望 State: ACTIVE
journalctl --user -b --no-pager -o cat _PID=$(pgrep -x gnome-shell) \
  | grep -iE 'fast-translate|JS ERROR' | tail -40
```

必须按 `_PID=` 过滤——上一次登录的壳会写进同一段 boot 日志。然后看症状：有图标但
没反应 ⇒ 第 1/2 条；没图标 ⇒ 第 3 条。

## 9. 真机会话验证

- `scripts/reload.sh` 只做 disable+enable。GNOME 50 上这**不会**重新 import 改过的
  `extension.js`（ESM 模块缓存是进程级的），所以它永远验证不了代码改动。要重启
  壳——Wayland 下意味着注销再登录。
- 日志：`journalctl -f -o cat /usr/bin/gnome-shell`，或按上面的 `_PID=` 过滤。
- 读本扩展自己的键要带 schema 目录：
  `GSETTINGS_SCHEMA_DIR=$PWD/schemas gsettings get org.gnome.shell.extensions.fast-translate <key>`。
- 四件事只能真机手工验：浅/深色实时切换后的弹窗、Esc、多显示器定位、以及翻译延迟
  （它受网络支配）。

## 10. 打包与翻译

- `scripts/pack.sh` 在临时目录里构建（唯一安全方式），但它还会创建 `venv/` 并需要
  联网，且传了 `--podir=po`。
- **本机没有 `msgfmt`/`xgettext`**，所以只要 `po/` 存在，`gnome-extensions pack`
  就会硬失败。仓库里没有 `locale/` 也没有 `.mo`，因此翻译从未加载过：每个 `_()`
  都直接返回 msgid。为将来的打包版修 msgid 仍然有意义，但 `scripts/update-po*.sh`
  在这台机器上跑不了。
- `schemas/gschemas.compiled` 被 gitignore。**新克隆在跑过
  `glib-compile-schemas schemas/` 之前是坏的。** 不需要往系统装任何东西：壳会从扩展
  自己的 `schemas/` 目录建私有 schema source。
- 改完 `schemas/*.xml` 必须先重新编译再跑任何测试。

## 11. 隐私边界

- 被双击拷贝的文本会通过 HTTPS 发给所选服务商：
  `translate.googleapis.com/translate_a/single`、
  `api-free.deepl.com/v2/translate`（host 可在 gsettings 改）、
  `fanyi-api.baidu.com/api/trans/vip/translate`、`openapi.youdao.com/api`。这是产品
  本身而非泄露——但不能被静默扩大。
- API key 与应用密钥**只存在 dconf**。git 里没有任何凭据；
  `test/unit.test.js` 与 `test/signing-crosscheck.js` 里的向量是合成的
  （`appid 20200101000000001`、`secretKey abcdefghijklmnop`、`testkey/testsecret`），
  所以 `git grep` 搜 `appid|secret|token` 会看着吓人但其实干净。每次推送前都要查这条。
- 扩展不写文件、不留剪贴板历史；缓存纯内存且 `disable()` 即清。
- 若干错误分支会把服务商返回的 detail 文本拼进消息里并落到 journal。应当假定剪贴板
  内容可能出现在日志中。

## 12. 平台事实（每条都在 50.1 上验证过）

- 扩展样式表被加载进**全 shell 作用域**的 `St.Theme`。一个不加前缀的壳类名会重排
  整个桌面：本 fork 曾发过 `.popup-menu-content { box-shadow: none }`，把桌面上每
  个菜单的阴影都抹掉了。绝不添加未加前缀的选择器。
- 扩展 CSS 里 `@import url("relative.css")` 可用（libcroco 解析器）。
- **St 无视 `max-height`** — 实测：内联 `max-height: 441px` 仍分配了 710 px，
  `get_preferred_height()` 也给 710。高度上限只能在 JS 里做
  （`FloatingTranslationWindow._computeCaps()`）。
- 运行时可用的 CSS 颜色工具：`-st-accent-color`、`-st-accent-fg-color`、`st-mix()`、
  `st-lighten()`、`st-darken()`、`st-transparentize()`。壳 CSS 里没有
  `@define-color`，所以 SCSS 那种编译期颜色名不可引用。
- 断言计算样式用
  `actor.get_theme_node().get_background_color()` / `.get_padding(St.Side.TOP)`。
- GNOME 50 上**无法从 JS 构造合成输入事件**：`Clutter.Event` 只暴露 `get_*`
  访问器，不能构造，也没有 setter。别想着在测试里注入点击或按键。
- `Main.pushModal(..., SYSTEM_MODAL)` 与 `global.stage.set_key_focus()` 都被实测并
  **否决**：前者让整个会话的 Super/Alt+Tab 失效，后者抢走焦点导致触发用的 Ctrl+C
  丢失 key-release、下面的应用开始自动重复。这两个设计不要再翻案。

## 13. 待办与未确认

- 百度与有道的语言表是**故意不完整**的：两家官方文档的表格由客户端渲染，读不回来，
  也没有凭据去探测。缺码会返回清晰的本地提示，而错码会返回一个令人费解的 HTTP 200
  错误体。拿到真实凭据后需重新核实。
- 百度/有道架构完成但**从未端到端跑过**——没有凭据。腾讯（TC3-HMAC-SHA256）、阿里
  云（HMAC-SHA1 RPC）、华为云（SDK-HMAC-SHA256）不需要新增依赖：GLib 原生覆盖。
- 弹窗的真机行为（§9），以及那约 40 ms/30s 的空闲增量来源（若用更多窗口能分辨的
  话）仍未归因。
- **RTL 属未验证，不是已修复。** 从 `libst` 里读不到 `text-align` 的取值表，Yaru 的
  CSS 也没有可参照用法，因此 St 是否接受 `text-align: start` 是未知的。警告标签仍
  保持 `left` 对齐，标题在 RTL 语言对里也仍指向 `➜`。在证明该取值被接受之前不要改。
- **各区域用自己的上限之后，dest 面板是否还有多余空白未经测量。** 原缺陷是十几像素
  的空白而非功能故障，在壳里断言它等于复刻私有布局推算，所以没有加专门测试；现有
  套件只能证明无回归。真机上目的地面板是否仍留空白需要人眼确认。
- **prefs 不按服务商过滤语言下拉。** 百度仍能在选择器里选到它映射表拒绝的 6 种
  （ID、LT、LV、SK、SL、TR）；修法是让报错点名具体语言对，而不是藏掉选项——过滤
  共享枚举会让这行偏好依赖服务商状态，还可能藏起用户已经存过的语言。
- 那 5 个遗留 schema 键（`auto-copy`、`auto-paste`、`auto-translate`、
  `keybinding-translate-clipboard`、`shortcut-enabled`）已在 schema 里加注说明，但
  **刻意不删**：删键会丢掉用户已存的值，属于删功能。
- `po/` 在这台机器上无法重生成（缺 gettext）。

## 14. 回滚

一次提交只管一件事，格式为 `type: 中文摘要`。上面每个步骤都是独立提交，
`git revert <sha>` 就精确退掉一个。`git push` 每次都需要明确决定；历史永不 rebase、
永不改写。
