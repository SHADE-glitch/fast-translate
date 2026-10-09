<p align="right"><a href="README.zh-CN.md">README</a> · <a href="MAINTENANCE.md">English</a> | <a href="MAINTENANCE.zh-CN.md"><b>简体中文</b></a></p>

# 维护手册

这是本 fork 的运维知识，不是用户指南——用户文档见
[README.zh-CN.md](README.zh-CN.md)。本文与 `docs/maintenance/` 里的每一条，都是在这台
机器上实测或从 shell 源码里读出来的；没有实测过的统一标注 *(待确认)*。

本文件是一个**路由器**。每段正文只住在一处，即 `docs/maintenance/` 下按主题分的文件，
这样一个事实只有一个归属地。来这里是为了知道该读哪份文件，留在这里的是那三样没有别的
归宿的内容。

## 1. 先读这一段

- **这个目录就是运行时的扩展目录**
  （`~/.local/share/gnome-shell/extensions/fast-translate@local`）。没有构建步骤，
  也没有独立的安装目标：改文件就是改正在运行的扩展，留在这里的多余文件可能被壳
  加载。绝不在本目录执行 `gnome-extensions install` 或 `gnome-extensions pack`
  （见 [AGENTS.md](AGENTS.md)）。
- 所有决策的优先级：**稳定性 > 性能 > 代码美观。**
- 唯一目标环境：**Ubuntu 26.04 + GNOME Shell 50.1 + Wayland。**用
  `gnome-shell --version` 和 `/etc/os-release` 核实过，不是假设。

各内容归属：

| 想查什么 | 去哪份文件 |
|---|---|
| 哪些东西绝不能被改回去？ | [INVARIANTS.zh-CN.md](INVARIANTS.zh-CN.md) |
| 向平台要了什么、验证到哪一步？ | [docs/maintenance/compatibility-matrix.zh-CN.md](docs/maintenance/compatibility-matrix.zh-CN.md) |
| 碰了哪些壳内部接口、升版怎么适配？ | [docs/maintenance/shell-internals.zh-CN.md](docs/maintenance/shell-internals.zh-CN.md) |
| 该跑什么来证明一个改动、按什么顺序？ | [docs/maintenance/verification.zh-CN.md](docs/maintenance/verification.zh-CN.md) |
| CPU/RSS 怎么测才让数字有意义？ | [docs/maintenance/cost-measurement.zh-CN.md](docs/maintenance/cost-measurement.zh-CN.md) |
| 知道但没修的问题？ | [docs/maintenance/open-items.zh-CN.md](docs/maintenance/open-items.zh-CN.md) |
| 逐个提交改了什么、为什么？ | [CHANGELOG.md](CHANGELOG.md)（仅有英文版） |
| 在本仓工作的规则（给 agent 也给人） | [AGENTS.md](AGENTS.md)（仅有英文版） |
| 会话状态：版本、未推送、待决 | [docs/reports/STATE.md](docs/reports/STATE.md)（仅有英文版） |
| 这一批到底跑了什么来证明 | [docs/reports/VERIFY.md](docs/reports/VERIFY.md)（仅有英文版） |

## 2. 不变量：这些不要"顺手修正"

已移到 [INVARIANTS.zh-CN.md](INVARIANTS.zh-CN.md)——"不要改回去"由那份文件承载，
而 `npm run check:log --invariants` 会直接从记录里打印 `CHANGELOG.md` 中已归档的行为
修复，所以没有任何东西是手抄的第二份。

## 3. 依赖

已移到 [docs/maintenance/compatibility-matrix.zh-CN.md](docs/maintenance/compatibility-matrix.zh-CN.md)，
那里现在还写明 `shell-version` 含 45 所隐含的 libadwaita API 下限。

## 4. 测试矩阵

已移到 [docs/maintenance/verification.zh-CN.md](docs/maintenance/verification.zh-CN.md)，
与 L0/L1/L2 证据层级、以及"新守卫必须先被看到失败"的规则放在一起。

## 5. 无头 harness

已移到 [docs/maintenance/cost-measurement.zh-CN.md](docs/maintenance/cost-measurement.zh-CN.md)
——隔离配方，以及那些"曾产出看起来正确的错误结果"的陷阱。

## 6. `test/eval-test.js` 里的脆弱断言

已移到 [docs/maintenance/verification.zh-CN.md](docs/maintenance/verification.zh-CN.md)，
与请求前置守卫表、以及那条目前守不住生产分支的守卫放在一起。

## 7. 实测成本基线

已移到 [docs/maintenance/cost-measurement.zh-CN.md](docs/maintenance/cost-measurement.zh-CN.md)，
与产出它的采样规则同处一份文件。无头的绝对值永远不能换算到真实会话，只有相对结论站得住。

## 8. 小版本更新的失效面

已移到 [docs/maintenance/shell-internals.zh-CN.md](docs/maintenance/shell-internals.zh-CN.md)，
那份文件现在同时是按 file:line 列出的接口清单和升级适配手册。

## 9. 真机会话验证

已移到 [docs/maintenance/verification.zh-CN.md](docs/maintenance/verification.zh-CN.md)。
值得在这里重说一遍的那一条：GNOME 50 上 `scripts/reload.sh` 验证不了代码改动——
disable/enable 不会重新 import 改过的 ES 模块。

## 10. 打包与翻译

- `scripts/pack.sh` 在临时目录里构建（唯一安全方式），但它还会创建 `venv/` 并需要
  联网，且传了 `--podir=po`。
- `pack.sh` 拷的是一份**显式清单**，所以 `docs/`、`test/`、`scripts/` 和根目录的
  `*.md` 永远进不了 zip。往仓库里加维护文档，对发什么东西没有任何影响。
- **本机没有 `msgfmt`/`xgettext`**，所以只要 `po/` 存在，`gnome-extensions pack`
  就会硬失败。仓库里没有 `locale/` 也没有 `.mo`，因此翻译从未加载过：每个 `_()`
  都直接返回 msgid。为将来的打包版修 msgid 仍然有意义，但 `scripts/update-po*.sh`
  在这台机器上跑不了——**所以目录是手工维护、由 `test/repo.test.js` 保证它诚实**：每个
  `_()` 字面量都要出现在 `messages.pot` 与 de/es/nl 里，任何目录都不许带着模板已不认识的
  msgid，源码里每条 `// Translators:` 注释都要以 `#.` 落到这四个文件。也就是说，加一条
  用户可见的串，就得同时改四处目录，`npm test` 才会绿。还欠什么见
  [docs/maintenance/open-items.zh-CN.md](docs/maintenance/open-items.zh-CN.md) 第 3 节。
- `schemas/gschemas.compiled` 被 gitignore。**新克隆在跑过
  `glib-compile-schemas schemas/` 之前是坏的。** 不需要往系统装任何东西：壳会从扩展
  自己的 `schemas/` 目录建私有 schema source。
- 改完 `schemas/*.xml` 必须先重新编译再跑任何测试。

## 11. 隐私边界

- 被双击拷贝的文本会通过 HTTPS 发给所选服务商。host 就是
  `translation-helper.js` 里每条 `PROVIDERS` 行的 `host` 字段，由请求构建器自己用的
  那批 endpoint 常量推出来：`clients5.google.com/translate_a/single?client=dict-chrome-ex`、
  `api-free.deepl.com/v2/translate`（完整 URL 是 `url` 这个 gsetting，所以 DeepL 在表里
  没有固定 host）、`fanyi-api.baidu.com/api/trans/vip/translate`、`openapi.youdao.com/api`。
  这是产品本身而非泄露——但不能被静默扩大。`test/unit.test.js` 会把每条声明的 `host`
  和它自己构建器发出的 URL 对比，所以这张表无法与请求脱节。
- API key 与应用密钥**只存在 dconf**。git 里没有任何凭据；
  `test/unit.test.js` 与 `test/signing-crosscheck.js` 里的向量是合成的
  （`appid 20200101000000001`、`secretKey abcdefghijklmnop`、`testkey/testsecret`），
  所以 `git grep` 搜 `appid|secret|token` 会看着吓人但其实干净。每次推送前都要查这条。
- 扩展不写文件、不留剪贴板历史；缓存纯内存且 `disable()` 即清。
- 若干错误分支会把服务商返回的 detail 文本拼进消息里并落到 journal。应当假定剪贴板
  内容可能出现在日志中。
- 本节是**维护者**的边界。*用户*现在也在设置窗口里被告知同一件事：`prefs.js` 的
  `updatePrivacyDisclosure()` 把所选服务商的 host 写进服务商那行的副标题，并为单词
  词典查询点名 `clients5.google.com`；`test/repo.test.js` 守住"随仓库安装的 gsettings
  默认值与那段文案的承诺一致"。用户*尚未*被告知的部分，仍要在新增任何对外请求前对着
  这张清单核一遍。

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
  `get_text_align()` 也是绑定的，取值是 `Pango.Alignment`（LEFT=0、CENTER=1、RIGHT=2）：
  `start` 与 `end` 都读回 **0**，与一个不认识的关键词一模一样，把 `text-direction` 设成
  RTL 也不变——St 认这两个词但一律映射到 LEFT，所以这里没法用壳的 CSS 表达"方向相关"的对齐。
- **竖向 `St.ScrollView` 的滚动条拿走 8 px**，对照组是同一只盒子把策略关掉（300→292）。
  这个 binding 里 `St.ScrollView` **没有** `get_vscrollbar()` / `get_hscrollbar()` /
  `get_allocation()`——只有 `add_child`、`set_child`、`get_child`、`get_width`、`get_height`、
  `get_children`、`get_theme_node`——所以宽度只能从"布局留给子元素多少"反推。
  `extension.js` 里的 `SCROLLBAR_ESTIMATE` 刻意留 16，`test/eval-test.js` 的 Test 5 断言真实值
  始终在这个上限内。
- GNOME 50 上**无法从 JS 构造合成输入事件**：`Clutter.Event` 只暴露 `get_*`
  访问器，不能构造，也没有 setter。别想着在测试里注入点击或按键。
- `Main.pushModal(..., SYSTEM_MODAL)` 与 `global.stage.set_key_focus()` 都被实测并
  **否决**：前者让整个会话的 Super/Alt+Tab 失效，后者抢走焦点导致触发用的 Ctrl+C
  丢失 key-release、下面的应用开始自动重复。这两个设计不要再翻案。

## 13. 待办与未确认

已移到 [docs/maintenance/open-items.zh-CN.md](docs/maintenance/open-items.zh-CN.md)。
"知道但没修"只写在那一处——不进 `CHANGELOG.md`（未修的东西没有提交可挂），也不进
`docs/reports/AUDIT.md`（那是它自己那次提交的快照）。

## 14. 回滚

已移到 [docs/maintenance/verification.zh-CN.md](docs/maintenance/verification.zh-CN.md)
的提交纪律一节。一行的版本：一次提交只管一件事，格式 `type: 中文摘要`，而 `git push`
每一次都需要明确决定。
