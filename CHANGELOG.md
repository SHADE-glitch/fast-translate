# CHANGELOG — fast-translate@local

Personal maintenance fork of Fast Translate (translate-assistant), frozen upstream imported at
`420251c`. This file records only the deviations I introduced after that import.

Coverage: 420251c..HEAD
Check with `npm run check:log`. Entries are `D-###`, monotonic, never reused.
An entry states what was true **as of its commit**, not current state: old entries are not
re-verified, and aggregate counts live in the checker's output, never in this file.

> **How the backfilled entries were written.** `Symptom` / `Change` below are compressed from the
> commit subject plus the state of the touched file at HEAD; I did not re-read every diff. Treat
> them as an index into the commit, not as a substitute for it. Entries whose `Evidence` names a
> test were re-run in the session that wrote them; the rest are `L?` on purpose.

`kind` cut: dropping it makes a bug → `fix`; dropping it only annoys me → `taste`
(zero obligation on an upgrade). A change that is both is split across two entries.

---

### D-001 · 2026-09-22 · fix · v10
Symptom  接管后的第一处：shell 打出 keybinding 相关警告，且残留不会被执行到的死代码
Change   消除 keybinding 警告路径并删除死代码
Evidence L?
Cost     与 D-002 是同一条工作流的两端，单独恢复其中一半会留下悬空设置键
Commit   91d9b1e

### D-002 · 2026-09-23 · taste · v10
Symptom  上游的交互是面板菜单 + 可配置全局快捷键；本仓想要的是一件事做到底的单手流程
Change   改为"双击复制即翻译"，删除面板菜单翻译 UI、`shortcut-enabled` 全局快捷键与面板自动化
Evidence L1（`npm run integration` 的评估测试断言面板 UI 与快捷键已不存在；本轮未逐条重跑）
Cost     **本 fork 的身份本身**。丢掉它不是 bug，只是变回上游；升级时这条是唯一"整块可丢"的参照
Commit   3d44996

### D-003 · 2026-09-23 · taste · v10
Symptom  结果浮窗没有关闭键、没有加载态、出现/消失是硬切
Change   加 `Esc` 关闭、loading 状态与开合动画
Evidence L?
Cost     纯体验倾斜；丢掉不产生缺陷，但会与 D-005 的诚实状态纠缠
Commit   f9419ad

### D-004 · 2026-09-24 · fix · v10
Symptom  浮窗遮罩铺满整块 stage（跨显示器的全屏几何），多显示器下遮罩吃掉相邻显示器上的点击
Change   遮罩与卡片改按单屏 work area 定位
Evidence L?
Cost     与鼠标位置/显示器布局相关，回归只在多屏环境暴露；不要按单屏验证就宣布修好
Commit   7932ae5

### D-005 · 2026-09-24 · fix · v10
Symptom  弹窗说谎：复制按钮在加载中标着可点、失败后不能就地重试，并在 shell 里留下 `Source ID` critical
Change   复制按钮 loading 期间置灰、失败可就地重试、消除 Source ID critical
Evidence L?
Cost     与 D-003 的加载态是同一块 UI，改一处要看另一处还成不成立
Commit   f060c8e

### D-006 · 2026-09-24 · taste · v10
Symptom  浮窗不跟随浅/深色主题与系统强调色
Change   拆成 `stylesheet-base.css` + `-light` / `-dark` 双变体，经 `@import` 共享结构
Evidence L?
Cost     旧的全局单文件 `stylesheet.css` 已不存在；这条同时解释了为什么只动旧文件的提交落在记录窗口之外
Commit   254ce61

### D-007 · 2026-09-24 · fix · v10
Symptom  高度棘轮：卡片在逐轮 settle 中只会变高不会变矮，长文本被永久撑开
Change   消除棘轮，settle 轮数从 9 轮降到 3 轮
Evidence L?
Cost     与 D-008 同源但可分离：棘轮是缺陷，上限值是偏好
Commit   5843765

### D-008 · 2026-09-24 · taste · v10
Symptom  长文本卡片占 work area 的 96%（710px），几乎顶满屏幕
Change   上限降到 60%（441px）
Evidence L?
Cost     纯个人取向，**升级时可整块丢弃**；丢掉只会回到"快占满屏"，不是坏
Commit   5843765

### D-009 · 2026-09-24 · fix · v10
Symptom  三处：界面里硬编码中文字符串（非中文用户看得到中文）、一条永不执行的死分支、Tooltip 越界
Change   去中文硬编码、删死分支、修 Tooltip 越界
Evidence L?
Cost     打包前需重跑 `po` 编译；文案改动会连带影响 `test/prefs-validator.js` 的布局断言
Commit   5ff5a88

### D-010 · 2026-09-25 · taste · v10
Symptom  只有 DeepL / Google 两家；想要按服务商各自的限额与签名规则统一调度
Change   建服务商注册表（百度 / 有道），抽出纯函数 `signing.js` 计算百度 MD5 与有道 v3 签名，请求规格统一
Evidence L0 本轮重跑：`GLib signing primitives match the node:crypto known-answer vectors`
Cost     引入凭据分组与新增翻译面；密钥处理路径从此进入本仓，隐私边界见 MAINTENANCE §11
Commit   23c9efe

### D-011 · 2026-09-29 · fix · v10
Symptom  `destroy()` 里任一处理器中途抛错就会中断后续清理，指示器被永久泄漏在 shell 里
Change   逐个处理器加存活守卫，单个失败不再中断整条销毁链
Evidence L0 本轮重跑：`destroy() totality tests passed (7 guarded, 2 intentionally bare, body at extension.js:1102)`——**"intentionally bare" 是刻意的，不是漏网**
Cost     去掉守卫不会报错，只会在真实销毁时泄漏；测试名单是判据，别把两个 bare 也"顺手"补上
Commit   69bde15

### D-012 · 2026-10-07 · fix · v10
Symptom  ⇄ 交换语言时把 "Auto detect" 当成目标语言写进去，下一次请求的目标语言非法
Change   交换时不再把检测项写进目标语言
Evidence L?
Cost     与 D-013 / D-018 同在语言处理链上，回归要连着一起跑
Commit   f4f1582

### D-013 · 2026-10-07 · fix · v10
Symptom  超限截断按 UTF-16 单元切，emoji 被数成两个字符、还会切出孤立代理项
Change   改为码点安全截断，计数按码点
Evidence L?
Cost     `signing.js`/请求体长度与实际发送文本必须一致，单边改会引入签名/限额偏差
Commit   b4560c2

### D-014 · 2026-10-07 · fix · v10
Symptom  用户已经主动关掉卡片，晚到的译文仍会改写剪贴板
Change   取消路径上不再执行剪贴板写入
Evidence L?
Cost     剪贴板是用户可见副作用，恢复它等于把"用户没要求的写入"请回来
Commit   f3b0424

### D-015 · 2026-10-07 · fix · v10
Symptom  关闭卡片后遮罩仍在吞点击（要等淡出动效跑完才解除），且淡出期间 actor 销毁无硬截止
Change   关闭即解除吞点击，并给淡出销毁加硬截止
Evidence L?
Cost     与 D-004 同一个遮罩生命周期；截止值改动会影响 D-011 的销毁链
Commit   8d7a5f0

### D-016 · 2026-10-07 · fix · v10
Symptom  ⇄ 重译复用上一条请求的看门狗状态，12 秒超时不再挂在新请求上
Change   重译时重新挂上 12 秒看门狗
Evidence L?
Cost     看门狗是可重入启用守卫的一部分（README §Reliability），单改这里会破坏取消代际
Commit   aac0edf

### D-017 · 2026-10-07 · fix · v10
Symptom  源语言与目标语言相同、或文本只有零宽字符时，仍然发出一次注定无意义的网络请求
Change   前置判断直接跳过，不再白跑请求
Evidence L0 本轮重跑：`request-sanity guard tests passed successfully!`
Cost     这是最容易被"看起来更勤快"的改动重新引入的一类问题，守卫测试是唯一屏障
Commit   7577ad7

### D-018 · 2026-10-07 · fix · v10
Symptom  "不支持的语言"提示不说是哪一对语言，用户只能猜
Change   提示里带上具体的语言对
Evidence L?
Cost     文案改动牵动 `po` 翻译与 D-009 的去硬编码约定
Commit   efa7927

### D-019 · 2026-10-07 · fix · v10
Symptom  配置文案与实现不符（写着不存在的行为），并残留死 import
Change   修正文案与文档、清理死 import
Evidence L0 本轮重跑：`Preferences layout validation successful!`（仅证明不抛错，不证明文案正确）
Cost     文案类修复没有测试能证，只能靠对读——这条的 `Evidence` 弱于它的断言范围，别把它当行为验证
Commit   aba4c8b

### D-020 · 2026-10-07 · fix · v10
Symptom  高度测量按单一上限判定，`dest` 分支不算自己的额度，留下无内容的空隙
Change   各区域按各自上限判定，dest 不再白留空隙
Evidence L?
Cost     与 D-007 / D-008 同一条高度路径；三者任一改动都要重看另两个
Commit   ce2a054

### D-021 · 2026-10-09 · taste · v11
Symptom  双击一个单词只得到一句译文，得不到词典式的详细解释（音标 / 词性 / 多义项 / 例句）
Change   Google 端点改走 `clients5.google.com` 的 `dict-chrome-ex` 客户端并请求 `dt=bd/rm/md/ss/ex`；新增纯函数 `parseGoogleDict`；单词渲染为词典卡（Pango markup 复用译文 label），句子仍为纯译文；Google 结果不再进缓存
Evidence L0+L1 本轮重跑：`Google dictionary parser tests passed successfully!`、`npm run integration` 报 `success:true`；并以扩展同款 `Soup.Session` 实测该端点返回 200 词典数据
Cost     词典卡依赖 Google 非官方端点，且仅 Google 出卡（DeepL/Baidu 无词典数据）；Google 恒用词典请求且不再进缓存（响应形状可变），靠 2.5 s 同文本冷却兜底；卡片复用译文 label，靠 `.dict` 类去掉粗体底重
Commit   f2bb9f0

### D-022 · 2026-10-09 · taste · v11
Symptom  D-021 的词典卡只在把服务商切成 Google 时才出现；用 DeepL 的用户双击单词拿不到词典卡
Change   新增纯函数 `looksLikeWord`；请求按输入路由——单个词走 Google（出词典卡），整句/段落仍走所选服务商；effective provider 贯穿请求构建与错误文案
Evidence L0+L1 本轮重跑：`word-detection tests passed successfully!`、`npm run integration` 报 `success:true`
Cost     单词会被发给 Google（整句仍只发所选服务商）；判定是保守启发式——无标点、无空格的 CJK 长片段会被当成词发给 Google；只对词生效，句子的行为与文案不变
Commit   e93d10a

### D-023 · 2026-10-09 · taste · v11
Symptom  词典卡把音标/词性/义项/例句压进译文 label 的 Pango markup：无法逐元素上色，且不显示主译文
Change   改为真实 actor 组成的结构化卡片（译文标题 + 音标 + 词性行 + 例句），逐元素套 CSS；改用纯文本渲染，删除 `escapeMarkup`/`_buildDictMarkup` 与 `.translate-floating-text-dest.dict`；高度测量改测活动子 actor（label 或 card），并在每轮清空 card 的 pinned height
Evidence L0+L1 本轮重跑：`npm run integration` 报 `success:true`（含重写的 Test 3i 结构化卡片断言与新增的词典卡 settle 收敛断言）
Cost     卡片是 `_destBox` 内的兄弟 actor，与译文 label 用 visible 互斥；`_applyHeightCaps` 每轮必须先清空 card 的 pinned height，否则重演 D-007 棘轮；卡片仅 Google 出卡的限制不变
Commit   08bf811

### D-024 · 2026-10-09 · taste · v11
Symptom  配置 ZH→EN 时双击英文单词（如 hello）被当作中文源，回显原文、拿不到词条
Change   新增纯函数 `baseLangCode`/`detectLang`/`resolveDirection`；仅对词在“检测语言 == 目标基码且 ≠ 源基码”时反转方向（新源取目标基码、新目标取旧源），句子与 AUTO 源不变；`_buildRequestSpec` 四个分支统一用有效方向
Evidence L0+L1 本轮重跑：`auto-direction tests passed successfully!`、`npm run integration` 报 `success:true`
Cost     检测仅覆盖 ZH/EN 两种脚本，其他语言不反转；仅对词生效，句子的服务商与方向不变；Google 恒不走缓存故缓存键无需改；标题仍显示设置方向，与自动方向可能不一致（记入 MAINTENANCE §13）
Commit   08bf811

### D-025 · 2026-10-09 · taste · v12
Symptom  词典卡显示的信息远少于 Google 实际返回：义项只截 6 个（Google 给到 19–20）、例句只 2 条（最多 30）、同义词（`d[11]`）与英英释义（`d[12]`）根本没渲染
Change   `parseGoogleDict` 增加 synonyms/definitions；卡片新增同义词与英英释义两个区块，并把上限提到 6 词性 / 15 义项 / 5 例句；两个区块仅在 Google 返回数据时显示
Evidence L0+L1 本轮重跑：`Google dictionary parser tests passed successfully!`、`npm run integration` 报 `success:true`（含 Test 3i 对两个新区块的断言）
Cost     同义词与英文释义只有英文词才有，ZH→EN 的中文词两者皆无；卡片变长，靠滚动容纳；新增两个段标题 `_()` msgid（未入 `po/`）
Commit   ac83b7a

### D-026 · 2026-10-09 · fix · v12
Symptom  自动方向把查词翻成 EN→ZH 后，弹窗顶部仍显示配置的 ZH→EN，标题与卡片不一致；此时按 ⇄ 交换的是配置对，对单词几乎无效
Change   标题改为显示本次请求的有效方向（`_triggerFloatingTranslation` 计算并把 dir 传给窗口与请求路径，`_translateTextIndependent`/`_buildRequestSpec` 增加可选 dir，缓存键改用有效方向）；⇄ 改为交换窗口当前显示的方向并以显式 dir 重新请求，不再改写配置对
Evidence L0+L1 本轮重跑：`npm run integration` 报 `success:true`（含新增 Test 3l：标题跟随有效方向 + ⇄ 交换显示对）
Cost     交换变为临时（不再写回 `_source_lang`/`_target_lang`，与设置同步不再打架）；无结果时 ⇄ 走原地刷新标题的旧路径，有结果时重建窗口以让源面板显示被翻译的文本
Commit   ac83b7a

### D-027 · 2026-10-09 · fix · v13
Symptom  默认源语言是 AUTO，但弹窗标题恒显示「🌐 Auto」，不跟随 Google 实际检测到的语言；且 AUTO 源下自动方向被整体跳过，默认 AUTO→EN 复制英文词会原样回显（实测 `bank → bank`，无翻译无词典）
Change   `resolveDirection` 增加 AUTO 分支：检测语言等于目标基码时改译到 ZH<->EN 的对侧（新源取目标基码、新目标取对侧），不再直接返回配置对；窗口新增 `applyDetectedSource(code)`，`_translateTextIndependent` 把完整 Google dict（含 detectedLang）交给回调，源仍为 AUTO 时用 `baseLangCode(detectedLang)` 刷新标题
Evidence L0+L1 本轮重跑：`auto-direction tests passed successfully!`、`npm run integration` 报 `success:true`（含新增 Test 3k AUTO 用例与 Test 3m 检测语言标题）；以扩展同款 `Soup.Session` 实测 AUTO→EN 的 `bank` 原样回显、`银行` 正常出词表
Cost     AUTO 的对侧只取 ZH/EN 这一对（`detectLang` 只认这两个脚本），其他语言对不翻转；标题更新仅 Google 有 detectedLang，DeepL/百度/有道（AUTO 源）标题仍显示 Auto；检测语言是基码，区域变体（zh-TW）会显示为 ZH
Commit   2a4dad1

### D-028 · 2026-10-09 · taste · v13
Symptom  中文词查英文（ZH→EN）时 Google 只返回双语词表，同义词/英英释义/例句三节恒为空，卡片显得「内容不全」；例句还缺小标题，词条上限 15 会截掉极长词条（如「打」动词 17 条）
Change   新增纯函数 `mergeEnrichedDict` 与 `_enrichZhToEnDict`：前向结果为中文词头且缺同义词/释义时，用其译文作词头反向查 EN→ZH，合并同义词/英英释义/例句（卡片先出、后台补全，带独立 cancellable+watchdog，best-effort）；例句加小标题；`DICT_MAX_TERMS` 15→20
Evidence L0+L1 本轮重跑：`Google dictionary parser tests passed successfully!`、`npm run integration` 报 `success:true`；以扩展同款 `Soup.Session` 实测 `银行→bank` 前向仅 noun:1，补查后 syn=2/def=2/ex=10
Cost     每个中文词查英文会多发一次 Google 请求（约翻倍），失败/超时（6s）静默保留前向卡片；反查词头用 Google 的译文，词性可能与中文词原词性不完全对应（如「美丽」译文 beauty 为名词）；同义词/英英释义/例句仍是英文内容
Commit   2a4dad1

### D-029 · 2026-10-09 · fix · v14
Symptom  中文词查英文的后台补查（D-028）在生产路径上从未发出过任何请求，卡片永远只有前向双语词表——与「补查失败静默保留前向卡片」这一文档化的 best-effort 行为外观完全相同，因此没有任何可见症状
Change   `buildGoogleRequest` 现在自己返回 `method: 'POST'` 与 User-Agent（原先只有 url/body/contentType，`Soup.Message.new(undefined, url)` 在 GJS 直接抛 `Expected type string for argument 'method'`，被调用方的 catch 吞掉）；`_buildRequestSpec` 的 google 分支不再重拼自己的 method/UA，两个调用方共用同一份形状
Evidence L0 新增断言先红（`got undefined`）后绿；`npm run integration` 报 `success:true`，Test 3i 现在能观察到补查的 watchdog 被真实挂上；gjs 侧独立探针实测 `spec.method="POST"` → message built
Cost     补查真的开始发请求，中文词查英文每次多发一次 Google 往返（D-028 的 Cost 那条"约翻倍"从今天起才成立）；D-028 的 Evidence 是脱离生产调用链的手测探针，按其定义不回改
Commit   e88b27d 60c6fef

### D-030 · 2026-10-09 · fix · v14
Symptom  `disable()` 之后仍有一个 6 秒 watchdog 与在途请求活着：`_enrichZhToEnDict` 的 cancellable 与 watchdogId 是函数局部变量，`destroy()` 拿不到句柄；回调有 `_destroyed` 守卫，所以表现为残留而非错乱
Change   两个句柄提到 `this._enrichCancellable` / `this._enrichWatchdogId`（`_init` 里声明），`destroy()` 成对 cancel+remove，重挂前 `_dropEnrichSource()` 先丢旧源（照 `_armSafetyTimeout` 既有写法），settle 时按 cancellable 身份校验再清空，避免晚到的回调用抹掉新请求的句柄
Evidence L0 `test/teardown-guard.test.js` 先加两步跑红（`step not found in destroy(): GLib.Source.remove(this._enrichWatchdogId)`）再实现，现报 `9 guarded, 2 intentionally bare`；L1 Test 3i 以行为证明存活（`GLib.source_exists` 在 GJS 未绑定）：对照看门狗到点必然回调 1 次，`destroy()` 后等过同一期限回调 0 次且句柄已清空
Cost     快速连拷两次时前一次补查被直接放弃（其 onDone 不再触发）——该回调原本也只对仍是当前卡片的窗口有效，故无用户可见变化
Commit   60c6fef

### D-031 · 2026-10-09 · guard · v14
Symptom  一整套断言已经 `success:true` 并打印通过，`npm run integration` 仍然以 1 退出：判决被清理步骤覆盖。本机 `rm` 解析到 gio 回收站包装，它拒绝删 `/tmp`（`Trashing on system internal mounts is not supported`），而 `set -e` 下 EXIT trap 在第一条失败命令处中断，trap 的状态码顶替真实结论；同一失败还让每次运行的临时树留在 `/tmp`
Change   两个 harness 的 cleanup 统一改成绝对路径 `/bin/rm` 且每步 `|| true`，注释写明"清理永不改写判决"的两条机制
Evidence 最小复现：`set -euo pipefail` + trap 内一条 `false` → `status=1`，加 `|| true` → `status=0`；改后 `npm run integration` 报 `success:true` 且 `exit=0`，`/tmp/ft-integration.*` 不再新增（残留的 7 棵时间戳均早于本次改动）
Cost     只在测试层，不影响发行物；把 `/bin/rm` 换回 PATH 上的 `rm` 会立刻恢复这个假红
Commit   61639e9
### D-032 · 2026-10-09 · chore · v15
Symptom  `test/unit.test.js` 一直守着 `swapLanguages` 的 AUTO 拒绝，而生产走的是 `onSwap` 里的内联副本（`extension.js` 对该 helper 引用 0 次）——那条 L0 断言测的分支生产根本不进，将来改坏内联副本 Node 依然全绿。行为本身没丢（错误码同为 `swap-source-is-automatic`），所以没有用户可见症状
Change   `onSwap` 改为调用 `swapLanguages`，被拒绝时沿用既有 provider 错误文案返回且不改写方向；`test/repo.test.js` 新增 describe，把五条「由单测钉住的纯判定」（`swapLanguages`、`safeTruncate`、`codePointLength`、`isSameLanguage`、`hasVisibleText`）列成清单，逐条断言 `extension.js` 里存在调用点
Evidence L0 清单先红（只有 `swapLanguages` 不满足：`# pass 6 / # fail 1`）后绿；L1 `npm run integration` 报 `success:true`（C2/C3/C4 都在树内时重跑的那一次）
Cost     交换被拒绝时的文案改走 `_providerErrorText`，与其他 provider 错误同源；新守卡只数调用点，删不掉内联副本的语义漂移——它保证的是「helper 一旦不再被生产引用，清单立刻变红」，而不是两份实现等价
Commit   1d44c07

### D-033 · 2026-10-09 · chore · v15
Symptom  `prefs.js` 的 `updateServiceVisibility()` 用 `service === 0/2/3` 决定哪一组密钥框可见，等于把 `PROVIDERS` 表在第二个文件里重抄一遍：追加或调整服务商时，设置窗口会显示另一家的密钥框，而单测对此一无所知
Change   `PROVIDERS` 每条声明 `credentialGroup`（不需要密钥的为 `null`）与 `supportsFormatting`（只有 DeepL 为真），prefs 读这两项驱动可见性与 DeepL 专属选项；`test/unit.test.js` 钉死四家到四个组的映射与「只有 DeepL 支持格式化」；`test/prefs-validator.js` 把相对 import 重绑定为绝对 `file://` URL——它故意把临时 runner 写到源码树外面，prefs 一开始 import 兄弟模块就报 `Unable to load file from: file:///tmp/translation-helper.js`，看着像 prefs 的缺陷，实为校验器自己的搬迁
Evidence L0 先红（旧数据形状不带这两个字段）后绿；`gjs -m test/prefs-validator.js` 报 `✅ Preferences layout validation successful!`；L1 `npm run integration` 报 `success:true`
Cost     prefs 现在依赖 `translation-helper.js`（该模块零 `gi://` import，已在 prefs 进程里实际加载过）；新增服务商必须同时填 `credentialGroup`，否则 L0 变红——这是刻意的摩擦。*(needs manual confirmation)*：真机上切换四家服务商的观感属 L2，本轮只证明布局校验通过
Commit   d731270

### D-034 · 2026-10-09 · chore · v15
Symptom  每次主题或 `darktheme` 变化，`_get_icon()` 在壳主线程上做两次同步 `Gio.File.query_exists()`（先 svg 再 png），而扩展图标是随目录一起安装的：这个探测在构造上恒真或恒假，永远不改变结果；`_set_icon_indicator()` 里还留着一条只有 stat 失败才走得到的 null 分支
Change   两次 stat 删除，直接按名字拼 svg 路径；「哪些图标随仓库存在」改成仓库不变式，由 `test/repo.test.js` 断言这条路径能点名的两个 active svg 确实在树里；那条 null 分支一并删掉
Evidence 守卡先红（往 `_get_icon` 注入一条真调用 → `# pass 10 / # fail 1`），并且证明它不会把修复本身当缺陷（把同一行写进注释 → `# pass 11 / # fail 0`）：为此新增 `srcCode()`，断言先剥掉整行注释、再只匹配 `.query_exists(` 的调用形状；`npm run integration` 报 `success:true`；`npm run perf cost` 全表重跑无劣化；gjs 微基准（暖缓存）单次 `query_exists` ≈ 2.9 µs、一次刷新的两次 ≈ 5.8 µs
Cost     按仓库规则这个量级不足以记作 `perf`，所以记 `chore`，数字留在正文。运行时不再兜底：若将来图标装成别的文件名，结果是坏图标而不是回退到另一个变体，改由 L0 变红来发现
Commit   f8d6fe9

### D-035 · 2026-10-09 · guard · v15
Symptom  `CHROME = 232`、警告测量用的 600px、`_getLabelWidth` 的 48、`SCROLLBAR_ESTIMATE = 16` 全是从样式表抄来的数字，注释只写数值不写来源。St 在这个 actor 上忽略 `max-height`，所以这些字面量就是布局契约本身——只是分居两文件，改 CSS 的人没有任何线索知道要同时改 JS
Change   每个常量旁注明它对应的 CSS 声明与行号；`test/repo.test.js` 新增 describe，从样式表现算「卡片宽 − 2×padding − 2×border」并与 `extension.js` 里 `get_preferred_height(<n>)` 的字面量比对，另两条钉住明暗两个变体的 border 相等、`spacing`/divider/`margin-top` 仍是注释引用的那三项。本轮另把文档里全部 `file:line` 锚点重算一遍（138 处，C1–C5 之后 `shell-internals` 两表的 14 行与 Soup/签名行都需要重定位）
Evidence 三条断言各自先红（CSS 宽度 650→700、深色 border 1px→2px、spacing 16→12）后绿；控制组：往同一条规则加 `min-width: 600px` 后守卡仍绿，证明它没把 `min-width` 误读成 `width`；红态消息带双方算式（`measures at 600, but CSS gives the card 700px - 2*24px padding - 2*1px border = 650px`）
Cost     头部 48px 与动作行 44px 是只有真机能量回来的合成高度，按 L2 明确留在断言之外；`SCROLLBAR_ESTIMATE = 16` 与 St 实际滚动条宽度的关系仍未实测 *(needs manual confirmation)*，注释按「高估只会让测量宽度更宽」的方向记为安全侧
Commit   f8d6fe9

### D-036 · 2026-10-09 · fix · v16
Symptom  后台模式（`floating-background-mode`）下翻译失败时用户得不到任何反馈：内联错误分支要求 `!isBackground`（`extension.js:721`），`fail()` 只在 `notifications` 为真时才 `Main.notify`（`extension.js:1014`），而该键的 schema 默认值是 **false**——按出厂配置，失败就是彻底的静默。`_showError()`（`extension.js:1282`）不受这个门控，但它只从 `extension.js:649` 的异常路径到达，服务商失败永远走不到它
Change   `notifications` 的 schema 默认值 false→true；`test/repo.test.js` 新增 describe "the shipped defaults keep the promises the settings copy makes"，把两个布尔默认值与 Escape 键的默认值钉住。门控本身不动——它的逻辑是对的，错的是出厂值
Evidence L0 断言先红（`expected: true / actual: false`）后绿；本轮又单独逼过一次：把默认改回 false → 红，按字节还原后 `git status` 显示 schema 干净；控制组（不改任何东西）绿；`npm run integration` 报 `success:true`
Cost     新装且从未碰过这个开关的用户开始收到失败通知（此前一条都不会）。已存在的 dconf 值不受默认值影响，所以这条只改变出厂首启行为
Commit   b4e4c77

### D-037 · 2026-10-09 · fix · v16
Symptom  后台成功的 toast 把用户自己的文本写进通知正文：`extension.js:687` 以 "Translated" 为标题、正文由 `requestText + " → " + toText` 拼成，原文与译文一起进了通知正文，而通知正文也显示在锁屏上。它同时与上面一行自相矛盾：`Double-copy Background Mode` 说的是 *silently*，而 `floating-background-toast` 的默认值是 true
Change   `floating-background-toast` 默认 true→false；那一行的副标题改成明写正文的两半内容并点名锁屏（`prefs.js:236`）；`notifications` 的文案改成 "when a translation fails"，因为它实际门控的只有失败通知（`prefs.js:254`）。两个默认值由 D-036 那条守卡钉住，文案与门控的对应关系从此是断言而不是注释
Evidence L0 先红（`expected: false / actual: true`）后绿；单独逼迫：默认改回 true → 红，还原后 schema 干净
Cost     依赖后台完成提示的用户需要自己把这个开关打开；隐私立场是"默认不泄露，要就明说后果"
Commit   b4e4c77

### D-038 · 2026-10-09 · fix · v16
Symptom  设置窗口对文本发往何处一字不提：没有任何用户可见的说明告诉用户"被拷贝的文本会离开这台机器"、会发给哪家服务商；此外单个词无论选什么都送去 Google 取词典卡（`_effectiveProvider`），同样未披露
Change   `PROVIDERS` 每条声明 `host`，由构建器自己用的 endpoint 常量经 `hostOf()` 推出（DeepL 为 `null`，因为它的端点就是 `url` 这个设置本身）；`prefs.js:485` 的 `updatePrivacyDisclosure()` 据此组装服务商行的副标题——发到哪个 host、需不需要密钥、非 Google 时单词还发往 `clients5.google.com`，并在 `changed::url` 时重算（`prefs.js:506`）。只出现主机名，永不出现文本、永不出现密钥。*决定并仍然有效：只披露——不加新开关，也不收窄（收窄会让词典卡回归失效）*
Evidence L0 `test/unit.test.js` 把每条声明的 `host` 与该构建器实际发出的 URL 用 `new URL().hostname` 对撞。本轮又逼了一次红线：把四行 `host` 字段从 helper 的一份副本上剥掉（`host: null` 与三处 `hostOf(...)`），让**未经修改的** `test/unit.test.js` 跑在那份副本上 → `exit=1`，`AssertionError: every provider must declare a host, even if only to say it has none`（`test/unit.test.js:228`）；把真实 helper 放回同一位置作控制组 → `🎉 All unit tests passed successfully!`。四家实际值全对；`gjs -m test/prefs-validator.js` 为四个服务商各渲染一次并断言副标题真包含那个 host，非 Google 还断言同时含 `clients5.google.com`（这组副标题断言没有单独逼红，清单见 D-043）
Cost     `prefs.js` 现在 import `translation-helper.js` 的 `getProviderById`；披露是拼接的模板串，翻译者面对的是片段而非整句；披露会随选择变化，所以它必须由校验器逐服务商断言，不能只看一次渲染
Commit   d2a2266

### D-039 · 2026-10-09 · taste · v16
Symptom  完全没有"恢复默认"的入口（改动前 `grep reset prefs.js` 无结果）：用户改过任何一项之后只能逐个手动还原，或者去动 dconf
Change   四个非凭据分区各加一行 `Restore this section’s defaults`，调用 `settings.reset_keys()` 且只带本分区自己的键（`prefs.js:412` 的 `addResetRow`，`prefs.js:451-454`）；三个凭据分组改用 `addClearKeysRow`（`prefs.js:428`）——第一次点击只武装并把副标题换成确认提示，第二次才真正清空，因为 issued key 无法从默认值重新推出，把它静默抹掉不是"恢复默认"而是损失。控件状态一律不跟踪：`bind()` 与 `changed::` 处理器在键重置后自己刷新
Evidence L1 校验器把点击分成两遍并按键集计数：第一遍四个分区各恰好重置一次、三个凭据集出现 0 次；第二遍三个凭据集各恰好一次、总数 7。见过红：按"每行一次"的假设记到 11 次重置——**是我的测试假设错了，实现是对的**，改成两遍计数后转绿
Cost     分区的键集硬编码在校验器里，新增设置不会自动进入恢复列表；真机上按一次恢复的观感属 L2，本轮只证明接线正确
Commit   d2a2266

### D-040 · 2026-10-09 · fix · v16
Symptom  打包进设置窗口的自相矛盾：`prefs.js` 的 "Project Homepage" 指向 `github.com/tazztone/translate-assistant`，而 `metadata.json` 的 `url` 指向本 fork；About 页也没有许可证一行
Change   fork 那一行改读 `this.metadata.url`（`prefs.js:352`），两处不可能再各说各话；上游另占一行保留署名（`prefs.js:372`）；新增 License 行（`prefs.js:331`）陈述 MIT 与 `LICENSE` 里署名的持有者。`LICENSE` 文件本身不动，这里不下任何法律结论。同一轮把三个凭据分组的 description 改成明写"两个字段里哪个是密钥"与"以明文存进 dconf"
Evidence L1 校验器为四个服务商各渲染并销毁一次窗口，行标题匹配覆盖主页与 License 两行的存在；新增的用户可见串全部进 `po/messages.pot`（见 D-042）
Cost     链接行沿用既有 `launch_default_for_uri` 写法，没有换成 `Adw.ActionRow:activatable-uri`——该属性的引入版本在本机不可证（`docs/maintenance/open-items.md` §6）
Commit   d2a2266

### D-041 · 2026-10-09 · taste · v16
Symptom  `keybinding-close-floating-window` 是活的（`extension.js:49`、`extension.js:384`），却完全没出现在 prefs 里；要暴露它，常规做法需要一个按键编辑器控件
Change   改成一行开关（`prefs.js:283-298`）：关闭时先把当前绑定存下来、写入空 `strv`，再开时还原存下的那个，没有存过就回落到 schema 自己的默认值（`defaultBinding()` 走 `settings_schema.get_key(...).get_default_value().deep_unpack()`，不在代码里另写一份 `Escape`）。刻意**不做**按键编辑器
Evidence L1 校验器按 `get_name()==='AdwSwitchRow'` 与标题找到这行，驱动两种转换（off 必须写空数组、on 必须写回 `Escape`），再用 `['<Primary>Escape']` 跑一次关→开往返，断言自定义绑定没有被丢掉。这三组 strv 断言同样没有单独逼红（见 D-043 的未逼红清单）
Cost     用户只能取舍"要不要 Escape"，不能自定义成别的组合键；如果 schema 默认值被改动而这个开关照旧，它会写回错误的绑定——该风险由 D-036 的守卡覆盖
Commit   d2a2266

### D-042 · 2026-10-09 · guard · v16
Symptom  `_()` 是唯一的翻译入口，而本机没有 gettext（`MAINTENANCE.md` §10），目录从不重生成：代码可以加一条串、发出去、`po/` 里根本没有它——UI 悄悄保持英文，翻译者拿到的是不完整目录。**规模要当场打印**：源码现在请求 115 条串，模板在补录前只有 103 条内容 msgid。我在提方案时把缺口说成"71 条"，那是**低报**；实际补录 91 条（`git show b4e4c77 -- po/messages.pot | grep -c '^+msgid "'`）。同一轮里"de/es/nl 全是空的"也不成立：三家各有 103 条 msgid，其中已翻译 17/56/17 条
Change   `test/repo.test.js` 新增 describe "the translation catalogs cover the strings the code asks to translate"：从三个源文件抽取所有 `_()` 字面量（先剥整行注释；JS 转义→原文→PO 转义；PO 续行拼接），断言 `po/messages.pot` 覆盖它们，并断言 de/es/nl 不带模板已不认识的 msgid。另加一条防空转的下限：抽取数必须 > 50，否则匹配器坏了就会让覆盖断言假绿。`po/messages.pot` 手工追加 91 条空 msgstr 条目并计算 `#: file:line` 引用（数量见上一条的打印命令）。*de/es/nl 有意未动*，等维护者决定
Evidence 覆盖断言先红后绿：把 pot 里一条 msgid 改名 → 红，随后还原。空转下限也见过红：把**未经修改的同一份守卡**跑在三处源文件为空壳的临时目录树上 → 红，报 `only 0 msgid(s) extracted — the _() matcher stopped working, so this guard is checking nothing`。这条守卫的初版还断言 locale 完整性与陈旧清除，那会要求批量改写 de/es/nl——被拦下后重新定形成"只让 pot 变红"
Cost     追加是手工的，`scripts/update-po*.sh` 本机仍跑不了；补录完成那一刻模板有 194 条内容 msgid 而源码只请求 115 条，也就是**约 79 条源文件已经不用的 msgid 留在 pot/locales 里**（其中 5 条是本仓自己那一刻加进去、随后又被同轮的 prefs 改动变成死串的——它们的清理记在后面的条目），清剩下的要动别人写的目录；守卡保证的是覆盖关系，不是目录质量
Commit   b4e4c77

### D-043 · 2026-10-09 · guard · v16
Symptom  `test/prefs-validator.js` 只断言 `fillPreferencesWindow()` 不抛异常，对控件绑定、副标题、默认值与恢复行为一句不断——而这一轮新增的恰恰全是行为
Change   驱动改为按 `PROVIDERS` 循环渲染四个服务商；窗口用 `get_first_child()/get_next_sibling()` 走成控件树收集副标题（这个 binding 里 `AdwPreferencesWindow` 没有 `get_pages()`），行按 `get_name()` 识别；断言披露的主机名、7 条恢复/清除行、两遍点击的重置计数，以及 Escape 开关的 off/on 与自定义绑定往返。mock 补 `get_string`、`reset_keys`、`set_strv`、`get_default_value`，导出 `__setServiceEnum` / `__resetLog` / `__setBinding` / `__strvLog` 一类钩子
Evidence 三处见过红，且都是**校验器自己**错而不是实现错：用 `get_css_classes().includes('row')` 找不到任何一行（0/7）→ 改按 `get_name()==='AdwActionRow'`；第一遍计数记到 11 → 我的"每行只触发一次"假设错了（恢复行按点击触发、清除行只武装一次），实现是对的，计数改成两遍后转绿；给 `AdwEntryRow` 传副标题直接抛 `TypeError: No property subtitle on AdwEntryRow`，这条测量把"给 6 个密钥行加大白话副标题"判为本机**做不到**，说明文字改放分组 description。现报 `✅ Preferences layout validation successful! (4 providers rendered)`。**未逐条逼红**：披露主机名、恢复/清除的两遍计数、Escape 的 off/on 与 `<Primary>Escape` 往返这四组断言是照着已实现的代码写的，本轮试图在临时目录里把 `serviceRow.subtitle` 写死来逼披露变红，被权限分类器拦下（不改仓库文件也不行，因为要跑 `gjs`），所以它们仍属"写过但没见过失败" *(needs manual confirmation)*
Cost     mock 不校验键名是否真实存在于 schema，写错的键名要到真机上才暴露；`Gio.Settings` 是假的，所以这仍是一个桌面门，留在 CI 之外
Commit   d2a2266

### D-044 · 2026-10-09 · chore · v16
Symptom  三份 locale 停在模板补录之前的状态：源码请求的串里有 86 条在 de/es/nl 根本没有条目；模板还留着 5 条本仓自己写下、随后被同轮 prefs 改动变成死串的 msgid；四份目录都没有 `#. ` 译者提示（HEAD 里命中 0 行），源码那 13 条 `// Translators:` 到不了译者
Change   三份 locale 各**纯追加** 86 条空 msgstr（删除行 0），模板删掉那 5 条死 msgid，活条目的 `#: file:line` 按当前源码重算（113 行加 / 120 行删），四份各带上逐字取自源码的 13 条 `#. ` 提示。**没有编造任何译文**：diff 里 `+msgstr "[^"]` 命中 0 行，未译按 gettext 规则回落到英文 msgid；既有译文逐字节保留（17/56/17 条，`^msgstr "[^"]` 那几行的 sha256 与 HEAD 分别同为 `8d757954eb5d` / `1e5890821617` / `af753ab9a13b`）
Evidence L0 — `node test/repo.test.js` 的覆盖断言转绿；上面每个数字都是一条 `git diff --cached | grep -c` 的现场输出而不是估算。四份目录现在各 190 条 `msgid`（含 header），即 189 条内容串
Cost     本机没有 gettext，`scripts/update-po*.sh` 仍跑不了，所以这三份是手写的——正因如此才需要 D-045；另外**源码已不再请求的 74 条 msgid 没有删**（它们随冻结上游的模板一起来），删它们等于改三位署名译者拥有的文件，等维护者拍板
Commit   9bffcbc

### D-045 · 2026-10-09 · guard · v16
Symptom  目录是手维护的（无 gettext），于是"加一条 `_()` 串却忘了四份目录"没有任何东西拦着：UI 安静地保持英文，译者拿到不完整的目录，而下一次手工编辑会把上一次的漂移当成正常状态。补录完成反而让这个风险变大——四份文件此刻是齐的，谁都能照着改
Change   `test/repo.test.js` 的 catalogs describe 扩三处：每个 locale 必须带上源码请求的每一条串；源码的 `// Translators:` 必须逐条落到模板与三份 locale 的 `#. `，且落地文本必须与源码同文；原来那条"只让 pot 变红"的孤儿断言改成"目录里不许留模板已不认识的 msgid"。防空转的下限写成无边界不变式：抽取 msgid > 50 且 `#. ` 提示 >= 10，否则匹配器坏了会让覆盖断言假绿
Evidence L0 — 先红后绿：这两条写在补齐目录**之前**，所以自己就红了（`13 "Translators:" comment(s) never reached po/messages.pot`，外加每个 locale 各一条覆盖红），条目与提示落地后转绿。下限也见过红：未经修改的同一份守卡跑在三处源文件为空壳的临时目录树上 → `only 0 msgid(s) extracted — the _() matcher stopped working, so this guard is checking nothing`
Cost     抽取器只认 `_()` 字面量和紧邻其上的 `// Translators:`，跨行或别名写法不在覆盖范围内；守卡保证的是覆盖关系，不是目录质量（术语一致性、fuzzy 标记都管不到）
Commit   cffa892

### D-046 · 2026-10-09 · guard · v16
Symptom  给"测试壳零写入"做成对取证有两个手段：取库的摘要，或者把库打印出来。本轮一对临时前后对照用的是后者，而本 schema 的 6 个字符串键（`apikey`、`baidu-appid`/`baidu-secret`、`youdao-appid`/`youdao-secret`、`url`）每一个都可能装着凭据，于是一条被重定向的日志就成了凭据的落盘点。至于到底有没有落到盘上**已不可复核**：临时文件都删了，而为了搜索密钥把密钥读回来这一步本身就违反这条规则——所以这里既不主张泄漏，也不主张没泄漏
Change   `test/repo.test.js` 新增 describe "a probe reads the settings store only as a hash"：仓库里任何 `.sh`/`.js`/`.mjs`/`.cjs`（先剥掉自己的整行注释）都不许再出现 `dconf dump`/`dconf read` 或 `gsettings get`/`list`；零写入性质一律用 `sha256sum ~/.config/dconf/user` 在**断言它的那一条命令里**成对取证。方法本身写进 `docs/maintenance/verification.md` §3 的仪器规矩，`AGENTS.md` 的隐私条目改为直接指向这条守卡
Evidence L0 — 两条断言各自逼红，都在 tar 出来的一次性副本里（不带 `.git`，入口模块是真文件）：可执行的 `dconf dump /org/gnome/shell/extensions/fast-translate/` 进 `test/integration.sh` → 红并点名该文件；`gsettings get … apikey` 进 `test/perf-probe.sh` → 红并点名该文件；删掉 `test/perf-probe.sh` → 覆盖下限红 `the scan saw 20 executable file(s) … perf-probe.sh=false`。控制组：**同样这两行**前面加 `#` 必须保持绿（33 pass / 0 fail），还原后也绿——守卡量的是代码不是散文
Cost     只扫可执行文件，所以散文里教的写法归 `AGENTS.md` 管；这条守卡拦不住一次性手敲的 ad-hoc 命令，拦的是被提交进仓库的做法
Commit   cffa892

### D-047 · 2026-10-09 · guard · v16
Symptom  两个长期挂着"待确认"的 St 未知量：浮窗的 RTL 对齐能不能在 CSS 里改，以及 `SCROLLBAR_ESTIMATE = 16` 到底覆盖了多宽的滚动条。两者此前只被注释和文档"估计"过，从没在真壳里量过
Change   `test/eval-test.js` 新增 Test 5：用 `StThemeNode.get_text_align()` 读回 `Pango.Alignment` 并断言 `center`=1 / `right`=2，而 `start`/`end` 在 LTR 与 RTL 下都回 0（与一条 `text-align: banana;` 同值）——St 不做方向敏感，所以 RTL 只能从 JS 按语言对选 `left`/`right`（行为改动，等维护者拍板）。滚动条宽度按布局效果量：合成 300px 的 `St.ScrollView` 被扣走 8px（292），真卡片 650→642，`vscrollbar_policy=NEVER` 的控制组扣 0；该 binding 里既没有 `get_vscrollbar`/`get_hscrollbar` 也没有 `get_allocation`，所以宽度只能这样量。`extension.js` 里 `SCROLLBAR_ESTIMATE` 上方注释改成实测结果，常量与其余代码一个字节都没改
Evidence L1 — `npm run integration` 两次 exit 0 且 `success:true`（22:35、22:44）；22:44 那次在同一条命令里取摘要，`~/.config/dconf/user` 前后同为 `291c5f98…`，`extension.js` 前后同为 `8773f1ed…`。"纯注释"另外用 `grep -vE '^\s*//'` 前后同为 `b4a2bdfb49a8` 证明。每条新断言都先逼红：卡片扣宽与合成扣宽不一致会红，`synthStolen > 16` 会红，`start` 若哪天变成方向敏感会红
Cost     `text-align` 的读数只说明 St 怎么解释 CSS，不说明视觉上真的右对齐了（视觉属 L2）。`SCROLLBAR_ESTIMATE` 故意保持 16 而不是改成实测的 8：收紧到 8 会让高度预算在最坏情况下少留一条行高，那是行为改动，本轮不动
Commit   440f56a
