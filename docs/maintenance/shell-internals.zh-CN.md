<p align="right"><a href="shell-internals.md">English</a> | <a href="shell-internals.zh-CN.md"><b>简体中文</b></a> · <a href="../../MAINTENANCE.zh-CN.md">维护手册</a></p>

# 本扩展依赖的壳内部接口，以及如何适配

这份 fork 碰过的、不属于普通 GJS/GLib 的每一个接口，配上碰它的那一行。内容拆自
`MAINTENANCE.md` §8。行号会漂——每一行都写成"可以去 grep 这个符号"的形式，不要
只信行号。

## 1. 清单

| 接口 | 位置 | 为什么承重 | 它变了会怎样 |
|---|---|---|---|
| `global.display.get_selection()` + `Meta.SelectionType` | `extension.js:287-288` | 读剪贴板 owner 来识别双击拷贝触发 | 有特性检测；触发静默失效 |
| `Meta.SelectionOwner::owner-changed`（connect / disconnect） | `extension.js:299`、`:373` | 触发本身；那个 disconnect 才是 `disable()` 干净的前提 | 双击 Ctrl+C 没反应 |
| `St.Clipboard.get_default().get_text()` / `.set_text()` | `extension.js:42`、`:312`、`:1658` | 读选区、把译文写回去 | 这次往返走 Wayland，`npm run perf` 看不见它 |
| `PanelMenu.Button` 子类 | `extension.js:221` | 面板 actor | `enable()` 抛错、图标消失 |
| `Main.panel.addToStatusArea()` | `extension.js:1413`、`:1423`、销毁路径 `:1436` | 注册，以及销毁时把它摘掉的那条路 | 面板项重复或成为孤儿 |
| `PopupMenu.PopupMenuItem` | `extension.js:270` | 面板菜单里唯一的 Settings 项 | 纯属外观，一项菜单 |
| `Main.wm.addKeybinding()` / `removeKeybinding()` + `Shell.ActionMode` | `extension.js:384`、`:388`、`:410` | 按窗口临时挂 Escape，那个 remove 保证它不跨窗口残留 | Esc 失灵，或者绑定活得比弹窗长 |
| `Main.notify()` | `extension.js:687`、`:1015`、`:1282` | 后台模式下唯一的输出通道 | 成功与失败都变成看不见 |
| `Main.uiGroup.add_child()` + actor `destroy()` | `extension.js:157`、`:1792-1793`、`:2462`、`:2466` | 弹窗是裸 actor 树，不是 `PopupMenu`——刻意为之，见 `INVARIANTS.md` | 出现活过 `disable()` 的弹窗 |
| `global.stage.connect('captured-event')` + `Clutter.KEY_Escape` | `extension.js:1820`、`:1813`、`global.stage.disconnect` `:2417` | 弹窗打开期间不抢模态也能收到 Escape | Esc 关不掉卡片 |
| `global.stage.width` / `.height` | `extension.js:181-182`、`:1885-1886` | 把 tooltip 和弹窗夹回屏幕内 | 界面跑到屏幕外 |
| `Main.layoutManager`（`focusIndex`、`primaryIndex`、`monitors`、`getWorkAreaForMonitor`） | `extension.js:1851-1857`、`:1872-1875` | 多屏定位：遮罩覆盖的是自己显示器的 work area | 弹窗落在错的屏幕上 |
| `St.ScrollView` | `extension.js:1546`、`:1578`；policy 在 `:1548`、`:1580` | 两块文本面板；`vscrollbar_policy` 构造后只读 | 官方替代品 `St.Clip` 没有滚动条——为什么不迁移写在 `docs/reports/PLAN.md` |
| `Pango.WrapMode` | `extension.js:1563`、`:1595`、`:1999` | 面板内的换行 | 换行异常 |
| `Gio.Icon.new_for_string()` | `extension.js:1326` | 面板图标按**文件路径**从 `icons/` 读，因此不依赖主题。这条路径原先在壳主线程上跑的两次同步 `query_exists()` 已删除（D-034）；哪些文件随发行物存在是仓库属性，由 `test/repo.test.js` 断言 | 图标坏掉；少了 svg 现在是仓库守卡直接变红，而不是运行时探测 |
| `Soup.Session`（`gi://Soup?version=3.0`）+ `send_and_read_async()` | import `:33`、session `:228`、调用 `:864`、`:1106` | 所有请求，全部异步 | 整个功能；这是唯一显式钉版本的 import |
| `GLib.compute_hmac_for_data` / `compute_checksum_for_string` / `base64_encode` | `signing.js:12-19`、`:25-30`、`:44-54`；`translation-helper.js:552`、`:558`、`:581`、`:590` | 百度与有道的请求签名；`compute_hmac_for_data` 收 3 个参数（实测） | 只影响签名——DeepL 与 Google 不签名 |
| 变体样式表文件名约定 | `stylesheet-light.css` / `stylesheet-dark.css` 这两个名字 | `_loadExtensionStylesheet` 命中第一个就停，只有 `-light`/`-dark` 会跟着 `notify::color-scheme` 实时重载 | 深浅色不再跟随系统 |

**测试侧的私有 API，刻意不受上面那些生产规则约束**：`test/bootstrap.js` 调
`_callExtensionInit` / `_callExtensionEnable`（内存后端下 `enabled-extensions` 是
空的，`gnome-extensions enable` 传不到嵌套壳），`test/eval-test.js` 会替换
`indicator._httpSession.send_and_read_async` 与 `GLib.get_monotonic_time`，并读
`ext.stateObj`。这些代码没有被扩展本体 import。

## 2. 小版本更新的失效面（按概率排序）

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
   是 *(待确认)*，见 [open-items.zh-CN.md](open-items.zh-CN.md)。

## 3. 分诊顺序

```bash
gnome-extensions info fast-translate@local          # 期望 State: ACTIVE
journalctl --user -b --no-pager -o cat _PID=$(pgrep -x gnome-shell) \
  | grep -iE 'fast-translate|JS ERROR' | tail -40
```

必须按 `_PID=` 过滤——上一次登录的壳会写进同一段 boot 日志。然后看症状：有图标但
没反应 ⇒ 第 1/2 条；没图标 ⇒ 第 3 条。

## 4. 升级适配手册

同一个壳大版本的新的 Ubuntu 修订，或者 `shell-version` 已扩到新高版本之后：

1. 先用上面两条分诊命令复现症状，再动代码。
2. 第一步跑 `npm test`——纯函数 helper 坏了、签名绑定变了、`prefs.js` 构造不起来，
   这些都不需要壳就能抓到。
3. 第二步 `npm run integration`——真实无头壳、零写入。它用壳自己的
   `_callExtensionInit`/`_callExtensionEnable` 加载扩展，所以 `enable()` 的回归会
   表现为 `ERROR:state=N`，而不是"某个功能不见了"。先读
   [cost-measurement.zh-CN.md](cost-measurement.zh-CN.md) 里的配方，别把 harness
   自己的失败算成扩展的。
4. 第三步 `npm run perf cost`——这里的回归是真信号，但先看采样规则：空闲 CPU 差异
   低于约 0.1% 单核属分辨率极限，说明不了任何事。
5. 到这一步才轮成真机。GNOME 50 上 `scripts/reload.sh` 验证不了代码改动——
   disable/enable 不会重新 import 改过的 ES 模块——所以这一步意味着注销再登录。
   只有四件事必须这么验，列在
   [verification.zh-CN.md](verification.zh-CN.md)。
6. 把结论记下来：行为变化进 `CHANGELOG.md` 的 `D-###`；知道但没修的只进
   [open-items.zh-CN.md](open-items.zh-CN.md)，别处不留副本。
7. 不要为了"让某步通过"去改 `INVARIANTS.md` 里的不变量——那几条看着都像 bug，
   但每条都有实测理由。
