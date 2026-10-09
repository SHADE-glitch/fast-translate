<p align="right"><a href="INVARIANTS.md">English</a> | <a href="INVARIANTS.zh-CN.md"><b>简体中文</b></a> · <a href="README.zh-CN.md">README</a></p>

# 不变量：这些不要被改回去

这是一个指针文件。它只列出"什么不许退化"以及证据住在哪；它刻意不收纳任何在别处已有
归属的正文，因为同一事实的第二份拷贝一定会腐烂。本文件是手册拆分时从 `MAINTENANCE.md`
§2 移过来的。

**行为**变化的权威是 [CHANGELOG.md](CHANGELOG.md)，不是本文件。不要把手修好的条目抄到
这里，直接从记录里打印：

```bash
npm run check:log -- --invariants      # 每一条 kind:fix，连同它的提交
```

## 1. 看起来是 bug、而且必须继续看起来像 bug 的东西

| 看起来像 bug | 为什么必须保持 | 在哪里被检查 |
|---|---|---|
| `gettext-domain` 是 `fast-translate@tazztone.github.io`，而 `uuid` 是 `fast-translate@local` | 编译出的 `.mo` 文件名必须与 domain 对齐，改了会静默失去翻译。 | 没有检查——不要动 `metadata.json`；这个 domain 今天代价几何见 [docs/maintenance/compatibility-matrix.zh-CN.md](docs/maintenance/compatibility-matrix.zh-CN.md) |
| 没有 `stylesheet.css`，只有 `stylesheet-light.css` + `stylesheet-dark.css` | `_loadExtensionStylesheet` 依次尝试 `${sessionMode}-${variant}.css`、`stylesheet-${variant}.css`、`${sessionMode}.css`、`stylesheet.css`，**命中第一个就停**。只有 `-light`/`-dark` 命名才会挂到 `notify::color-scheme` 的实时重载上。 | `test/eval-test.js` 的 `wantBg` 与 `padTop !== 24` 锚点（[docs/maintenance/verification.zh-CN.md](docs/maintenance/verification.zh-CN.md)） |
| `shell-version` 列 `"45"`…`"50"` | 只比大版本，见 [docs/maintenance/shell-internals.zh-CN.md](docs/maintenance/shell-internals.zh-CN.md)。没验证过就不要加新大版本；但也不要为了让范围"诚实"就删掉一个——45–49 是声明在内、只是本机从未跑过。 | 只有 `npm run integration` 覆盖 50.1；45–49 没有任何自动化 |
| `metadata.json` 的 `url` 指向本 fork | 刻意为之：这是冻结上游的承接 fork。 | 静态 |

## 2. 已实测并否决的设计——不要再翻案

- 用 **`Main.pushModal(..., SYSTEM_MODAL)`** 做弹窗：卡片打开期间整个会话的 Super 与
  Alt+Tab 全部失效。
- 用 **`global.stage.set_key_focus()`** 捕获 Escape：抢走焦点，导致触发用的 Ctrl+C 丢失
  key-release、下面的应用开始自动重复。
- 在扩展样式表里写**不加前缀的选择器**：它被加载进**全 shell 作用域**的 `St.Theme`。本
  fork 曾发过 `.popup-menu-content { box-shadow: none }`，把桌面上每个菜单的阴影抹掉了。

## 3. 本扩展从不做的事

不改写原型、扩展代码里不用 `imports.ui.*`、不注入 shell 内部函数、没有后台定时器、没有
自建 D-Bus 服务、不做任何文件持久化、不在 shell 进程里 import Gtk/Gdk。所以任何失效的
影响面只有本扩展自己，不会拖垮 shell 或邻居 fork。

*确实生效*的请求前置守卫（`swapLanguages`、`safeTruncate`、`isSameLanguage`、
`hasVisibleText`）列在
[docs/maintenance/verification.zh-CN.md](docs/maintenance/verification.zh-CN.md)，同处
还写明其中哪一条目前并没有守住生产实际走的那条分支。

## 4. 维持不变量的规则

- 不要为了"让某步验证通过"去改不变量。上面每一行都看着像 bug，但每行都有实测理由。
- 只有"长期禁止"才配进本文件。一次性的修复属于 `CHANGELOG.md`；知道但没修的属于
  [docs/maintenance/open-items.zh-CN.md](docs/maintenance/open-items.zh-CN.md)。
- 本文件是根级文档，因此受 `test/repo.test.js` 的双语配对守护：它的 `## ` 小节数必须与
  [INVARIANTS.zh-CN.md](INVARIANTS.zh-CN.md) 一致。
