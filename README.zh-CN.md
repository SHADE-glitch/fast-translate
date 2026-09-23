<p align="right"><a href="README.md">English</a> | <a href="README.zh-CN.md"><b>简体中文</b></a></p>

# Fast Translate —— 本地维护分支

双击复制，即时翻译 —— 在 GNOME Shell 中直接使用 Google 翻译与 DeepL。

![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-45--50-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Based on: translate-assistant](https://img.shields.io/badge/based%20on-translate--assistant-orange)
[![Repository](https://img.shields.io/badge/repository-GitHub-black?logo=github)](https://github.com/SHADE-glitch/fast-translate)

## 项目说明

本仓库是 **Fast Translate** 的**个人维护分支**，而 Fast Translate 本身又是 [Lorenzo Carbonell（atareao）](https://github.com/atareao) 的原始项目 [**translate-assistant**](https://github.com/atareao/translate-assistant) 的现代化分支。

分支脉络：

```
atareao/translate-assistant  →  tazztone/fast-translate  →  本分支 (fast-translate@local)
```

本项目**与两位上游作者均无关**，也未获得其背书。本分支将扩展收敛为单一而专注的工作流——**翻译你刚刚复制的内容**——并加以强化：LRU 缓存、请求看门狗、精确的自回声抑制，以及修复 DeepL 区域语言代码问题。

## 功能特性

- **双击复制即时翻译** —— 正常复制文本后，在约 500ms 内再按一次 `Ctrl+C` 即可翻译。无需菜单，无需切换窗口。
- **浮动翻译窗口** —— 可拖动、自动居中的弹窗，显示源语言与目标语言，带**交换**与**复制**按钮，可选自动复制。
- **后台模式** —— 静默翻译并直接把结果写入剪贴板，随时可粘贴，可选桌面提示通知。
- **两种后端** —— **Google 翻译**（无需 API Key，开箱即用）与 **DeepL**（免费版与专业版）。
- **内联语言选择** —— 偏好设置中的旗帜 emoji 网格。
- **健壮性** —— LRU 翻译缓存（50 条）、12 秒请求看门狗、原生 `St.Spinner` 加载态、友好的网络错误提示，以及精确的自回声抑制，确保你自己的复制不会被误判为新输入。

## 截图

![双击复制快捷键触发的浮动翻译窗口](screenshots/CTRLCC.webp)

## 前置依赖

| 依赖 | 说明 |
|---|---|
| GNOME Shell | 45 – 50 |
| DeepL API Key | 可选 —— 仅在选择 DeepL 作为服务时需要（[免费版或专业版](https://www.deepl.com/pro-api)） |

## 安装

```bash
git clone https://github.com/SHADE-glitch/fast-translate.git ~/.local/share/gnome-shell/extensions/fast-translate@local
cd ~/.local/share/gnome-shell/extensions/fast-translate@local
bash scripts/pack.sh      # 编译 schema 与翻译并安全打包
```

或就地安装并启用：

```bash
gnome-extensions enable fast-translate@local
```

在 Wayland 下需注销后重新登录，GNOME Shell 才会加载扩展。

> [!WARNING]
> 切勿在仓库目录内运行 `gnome-extensions install` 或 `gnome-extensions pack` —— 安装工具会跟随符号链接并可能清空源码目录。请使用 `scripts/pack.sh`，它通过临时目录打包。

### 卸载

```bash
gnome-extensions disable fast-translate@local
rm -rf ~/.local/share/gnome-shell/extensions/fast-translate@local
```

## 使用

复制任意文本，然后在约 500ms 内再按一次 `Ctrl+C`。

- **浮动窗口模式（默认）：** 弹出翻译结果，不抢占焦点、不使屏幕变暗。
- **后台模式：** 静默翻译并替换剪贴板内容；用 `Ctrl+V` 粘贴。可选提示通知会在完成时弹出。

面板图标仅暴露一个 **设置** 入口。

## 偏好设置

打开 **GNOME 设置 → 扩展 → Fast Translate → 设置**，可配置：

- 当前服务（Google 翻译或 DeepL）
- DeepL API Key 与 URL（选择 Google 翻译时隐藏）
- 默认源语言与目标语言
- 双击复制行为，包括后台模式与完成提示
- 格式与主题选项

## 相对上游的改动

本分支移除了原面板菜单翻译器与可配置的全局快捷键，仅保留双击复制工作流，并新增可靠性改进：

- **移除：** 面板菜单翻译 UI（输入/输出框、翻译按钮、错误标签、语言选择弹层）与全局快捷键（`shortcut-enabled`），以及面板自动粘贴 / 自动翻译 / 自动复制。
- **新增：** LRU 翻译缓存（上限 50 条）、12 秒请求看门狗（含可重入启用守卫与请求代际取消）、基于「最后一次内部复制文本」的精确自回声抑制、原生 `St.Spinner` 加载指示（加载中禁用复制按钮）、友好的传输/HTTP 错误提示。
- **重构：** 将 Google 与 DeepL 请求构造抽取为纯函数、可测试的 `translation-helper.js`。
- **修复：** DeepL 会以 400 拒绝 `EN-US` / `PT-BR` 这类区域语言代码 —— 现在会在语言交换后归一化（`EN-US` → `EN`，`PT-BR` → `PT`）。
- **偏好设置：** 移除「Panel Menu Automation」分组并重排其余分组。
- **测试：** 单元测试覆盖新增的纯函数；评估测试改为断言面板 UI 与快捷键已不存在。

## 参与贡献

1. Fork 本仓库。
2. 新建分支：`git checkout -b <branch_name>`。
3. 提交改动：`git commit -m '<commit_message>'`。
4. 推送分支并创建 Pull Request。

运行测试：`npm test`（Node 单元测试，外加 GJS 偏好设置布局校验）。

## 致谢与来源说明

本扩展是 **Lorenzo Carbonell Cerezo（atareao）** 的原始项目 **Translate Assistant** 的分支，后经 **tazztone** 现代化为 **Fast Translate**。

- **原始上游：** [atareao/translate-assistant](https://github.com/atareao/translate-assistant)，作者 Lorenzo Carbonell Cerezo —— 许可证 **MIT**
- **现代化上游：** [tazztone/fast-translate](https://github.com/tazztone/fast-translate) —— 许可证 **MIT**
- **原始贡献者：** Philipp Kiemle（daPhipz）、Fabrício Müller（fabricio8800）、Heimen Stoffels（Vistaus）、Lorenzo Carbonell（atareao）
- **上游（本分支之前）引入的功能：** Google 翻译默认后端、`Ctrl+C` `Ctrl+C` 双击即时翻译、后台模式、内联旗帜 emoji 网格、高 DPI 缩放与集成测试。

## 许可证

本项目采用 **MIT 许可证** —— 见 [LICENSE](LICENSE)。

© Lorenzo Carbonell Cerezo（atareao）、tazztone 及贡献者；分支修改 © SHADE-glitch。
