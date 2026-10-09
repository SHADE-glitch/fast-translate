<p align="right"><a href="compatibility-matrix.md">English</a> | <a href="compatibility-matrix.zh-CN.md"><b>简体中文</b></a> · <a href="../../MAINTENANCE.zh-CN.md">维护手册</a></p>

# 兼容矩阵

本扩展向平台要了什么，以及这份"要"到底被验证到哪一步。内容拆自 `MAINTENANCE.md`
§3 与 §8，指路表留在那边。

## 1. 运行时依赖

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

## 2. libadwaita 的下限是 1.4，不是 1.9

`shell-version` 声明 45–50，而 GNOME 45 带的是 libadwaita **1.4**。上表里的数值
是本机的，用 `gnome-shell --version` 与 typelib 文件实测得到——它们不是下限。

这里新增的任何 `prefs.js` 控件或 API 都必须在 Adw 1.4 上存在。`Adw.PasswordEntryRow`
（1.5+）、`AdwPreferencesGroup.header-suffix`（1.5）以及任何基于 `AdwToolbarView`
的写法，在 1.9.1 上加载正常，在 45 上**构造即失败**——而 45 就在声明范围内。

## 3. 版本闸门的机制

GNOME 的版本闸门**只比大版本**——`extensionSystem.js` 的 `_isOutOfDate()` 是
`shell-version.some(v => v.startsWith(PACKAGE_VERSION.split('.')[0]))`。所以
`50.2`、`50.3`… 会**不带任何警告**地加载本扩展，真实不兼容只会以运行时 JS 错误
出现。在 Ubuntu 上，多数"小版本更新"其实是上游号不变、Ubuntu 修订号变并带着下游
补丁（`extensionSystem.js` 自己就有 `Desktop.is('ubuntu')` 分支）。

跨到 **GNOME 51** 是另一回事：直接 `OUT_OF_DATE` 完全不加载，直到往 `shell-version`
里加上 `"51"`。

哪个版本会坏什么、按命中概率排序并附症状，见
[shell-internals.zh-CN.md](shell-internals.zh-CN.md)。

## 4. 声明范围与真正跑过的范围

`metadata.json` 声明 `"45"…"50"`。这个范围是从冻结的上游继承来的，本 fork **没有**
逐大版本重新验证：

| Shell | 本机是否真跑过 | 证据层级 |
|---|---|---|
| 50.1 | 跑过 | [cost-measurement.zh-CN.md](cost-measurement.zh-CN.md) 里的每个数字，外加一次真机会话 |
| 45–49 | **从未** | 只有静态推断——`test/` 里没有任何东西启动过旧版壳 |

所以声明范围是关于意图的声明，不是实测矩阵。不要为了"让这张表诚实"去放宽或收窄
`shell-version`：加减一个大版本会改变壳加载什么，而 AGENTS.md 把这个字段钉住了。
真出现兼容性问题时，去查那份 API 清单，别改这个字段。
