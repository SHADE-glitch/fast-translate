<p align="right"><a href="cost-measurement.md">English</a> | <a href="cost-measurement.zh-CN.md"><b>简体中文</b></a> · <a href="../../MAINTENANCE.zh-CN.md">维护手册</a></p>

# 功耗与泄漏的固定度量方法

流程和数字刻意放在一起：一条成本结论如果丢了产生它的采样规则就无法复查，而一份
没人能复现的基线只是装饰。内容拆自 `MAINTENANCE.md` §5 与 §7。

## 1. `npm run perf` 到底跑了什么

`test/perf-probe.sh` 在私有 Wayland 显示器和私有总线上拉起一个一次性
`gnome-shell`，在进程内把扩展装好，然后驱动 `test/perf-probe.js`；跑完由
`test/perf-summary.js` 打印 JSON。

- 阶段：`npm run perf cost`（单次事件成本，约 2 分钟）、`idle`（什么都不做时归属
  于扩展的 CPU/RSS，约 4 分钟）、`all`（默认，约 5 分钟）。
- 阶段选择器是环境变量 `FT_PERF_PHASES`。shell 变量 `PHASES` 只是外层脚本的输入
  ——这个不一致曾经让每次运行都静默跑完整套阶段并超出 cost 的时间预算。
- 产物落在 `~/.cache/fast-translate-perf/`；`result.json.phase` 在每个阶段边界都
  会写，所以被打断的运行能告诉你是跑到哪一步停的（`last-phase.txt` 就是为此拷出来
  的）。

## 2. 隔离配方——强制，且两个 harness 共用

`test/integration.sh` 与 `test/perf-probe.sh` 用同一套配方。**改配方必须同时改两
处。**

```
dbus-run-session  +  GSETTINGS_BACKEND=memory  +  XDG_DATA_HOME=<tmp>/data（符号链接到本仓库）
XDG_RUNTIME_DIR=<tmp>/runtime  +  --headless --wayland-display=wayland-<唯一名> --unsafe-mode
```

- 光有 `dbus-run-session` **不算写隔离**：dconf 写入由真实 `XDG_CONFIG_HOME` 服务，
  会落进 `~/.config/dconf/user`。让它真正不写的是 `GSETTINGS_BACKEND=memory`。这是
  安全属性而不是整洁问题——`eval-test.js` 会强制 set 本扩展 schema 的三个键。
- 私有 `XDG_RUNTIME_DIR` 也不是为了整洁。壳在启动时会创建
  `$XDG_RUNTIME_DIR/gnome-shell-disable-extensions`；这个文件存在期间，一旦壳崩溃
  就会**禁用全部**用户扩展。把它留在真实的 `/run/user/1000` 里，等于让一个嵌套测试
  进程威胁到当前会话。
- GNOME 50 上提供 `org.gnome.Shell.Eval` 的是 `--unsafe-mode`（不是 `--devkit`），
  且它不出现在 `--help-all` 里。
- 内存后端下 `enabled-extensions` 是 schema 默认值（空），`gnome-extensions enable`
  传不到嵌套壳。所以由 `test/bootstrap.js` 走壳自己的 `_callExtensionInit` →
  `_callExtensionEnable`，顺带把样式表真实加载一遍。
- `GIO_USE_VFS=local`——不加它，GVFS 会往被重定向的 `XDG_DATA_HOME` 里写
  `gvfs-metadata`，于是清理用的 `rm -rf` 失败，`set -e` 把一次通过的运行变成退出码
  1。

## 3. 已经咬过一次的配方陷阱

下面每一条都曾产出过"看起来正确"的错误结果：

- **没有** Eval 的 shell 会返回 `(false, ...)` 且**退出码为 0**。所以要轮询回复里的
  `(true,`；只测退出码会立刻"成功"，然后静默把调用打到别的进程上。
- `ExtensionState`：`ACTIVE 1, INACTIVE 2, ERROR 3, OUT_OF_DATE 4, INITIALIZED 6`。
  `INITIALIZED` 表示对象已存在但 `extension.js` **尚未** import，`stateObj` 还是
  undefined；而 `createExtensionObject` 压根不设 `state`，所以轮询 `lookup(uuid)`
  是否为真值不够，要轮询 `state !== undefined`。
- `enable()` 把 indicator 推迟到一个 `PRIORITY_LOW` 的 idle 回调。`enable()` 一返回
  就读 `Main.panel.statusArea[UUID]`，正是那次"面板按钮消失了"的来源。
- 在 `bash -c '...'` 体内不能出现未转义的撇号：它会截断字符串，剩下的部分跑到外层
  shell 执行。这事真发生过一次，表现是一条莫名其妙的 `trap: usage`。
- 跑完检查有没有遗留的嵌套壳——但要先读输出再数条数：`pgrep -f 'gnome-shell --headless'`
  会匹配到**执行这条检查的那个 shell 自己的命令行**，于是报出一个并不存在的泄漏。改用
  `pgrep -x gnome-shell` 再看 `/proc/<pid>/cmdline`，或者把打印出来的行过滤掉。每个真实
  残留约占 230 MB 和若干 CPU，而且会污染你自己的测量。
- **清理必须走 `/bin/rm`，而且必须容错。** 本机 `rm` 解析到 gio 回收站包装，它拒绝删
  `/tmp` 下的东西（`Trashing on system internal mounts is not supported`）；在 `set -e`
  下，EXIT trap 正好在那里中断，于是 trap 的状态码顶替了运行结论——一套全绿的断言以 1 退出，
  还留下删不掉的临时树。现在每个清理步骤都是 `/bin/rm … || true`。

## 4. 让数字有意义的采样规则

- **1 tick = 主线程 10 ms CPU**（Linux 上 USER_HZ 为 100）。在这个环境里承担结论的
  是 tick 而不是墙钟时间：一个被推迟的 idle 可能在几分钟之后才被调度，并落进同一个
  窗口。
- `/proc/self/stat` 的第 14+15 个字段必须在**最后一个 `)` 之后**切分——comm 字段本身
  就可能含空格和括号。
- 内存主读 `/proc/self/status` 里的 `VmRSS`；`/proc/self/statm` × 4 KiB 只作后备。
- `System.gc()` **会烧主线程 CPU**，所以只属于内存采样那一侧。在 tick 窗口里 gc 会
  凭空造出负载——一次 21 ms 的窗口曾被读成真实成本。
- 单组"前/后"窗口会被启动漂移带偏。所以 idle 阶段按 30 s 窗口交替
  disabled/enabled/disabled/enabled，并且每次状态切换都等面板按钮，保证一个窗口
  测到的确实是被标注的那个状态。
- 循环前后的沉降必须**对称**（两侧都是 `SETTLE_MS = 6000`）。早前那次可疑的
  `+3 MB` 泄漏，纯粹是因为前 6 s、后 4 s。
- 循环必须**从已知的"关闭"态起步**：刚启动时扩展已经是启用态，第一次
  `setEnabled(true)` 是空操作，什么也测不到。

## 5. 实测成本基线

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
  arena 爬坡后饱和，不是线性泄漏。
- **空闲 CPU 处在分辨率极限。** 交替的 4 × 30s A/B/A/B 窗口跑两次：一次
  `启用 - 关闭 = +4.0 ticks`（组内波动 1），另一次 `+0.5`（波动 2）。诚实的说法是
  **0 – 0.13% 单核**，无法稳定与壳自身地板分离。之前"实测为零"的表述说过头了。
- **空闲 RSS 同样分不出来**：gc 后启用态对比未加载态，一次 `+1792 KB`，一次
  `-28 KB`。

## 6. 无头测不到的部分

测不到、但真正决定体感延迟的两项：每次复制的 `Clipboard.get_text()` Wayland 往返，
以及服务商的网络 RTT。凡是涉及真实渲染成本、动画、合成器的结论也都不在这个 harness
的能力范围内——无头用的是虚拟显示器加软件渲染。所以关于"用户觉得快不快"的结论属于
真机清单，不属于这份文件。
