# Aria2 Bridge

桌面 Firefox 140+ 下载接管插件，连接已有的 HTTP(S) aria2 JSON-RPC 服务，内置 AriaNg 1.3.14 标准版。JavaScript、原生 `browser.*`、Firefox 后台脚本与原生侧栏，不包含 Chrome 兼容层。插件不会启动 aria2。

## 使用

1. 安装签名版本，或在 `about:debugging#/runtime/this-firefox` 临时载入构建产物的 `manifest.json`。
2. 打开设置，填写 RPC 地址（例如 `http://127.0.0.1:6800/jsonrpc`）、Secret 和默认目录，点击“保存并测试连接”。目录是 **aria2 所在机器**的路径。
3. 用工具栏添加 HTTP(S) 或磁力链接，每行一个，最多 100 个；也可右键发送网页链接。
4. 点击“打开 AriaNg”进入管理标签页。已打开时会复用；也可在工具栏或 Firefox 侧栏菜单中打开侧栏。两者共享默认 RPC 和配置。
5. 成功测试默认服务后，可以开启自动接管。切换默认服务会关闭接管，需主动重新开启。

多个 RPC 服务分别保存名称、Secret、目录与 Cookie 转发开关。手动粘贴的链接没有来源上下文，不读取其他标签页的登录态。右键发送在 Cookie 转发开启时只支持所点击的非隐私顶层页面内同源链接；跨站或 iframe 链接会要求从原页面下载，或关闭 Cookie 转发后作为公开链接发送。

工具栏图标以绿色表示自动接管开启、灰色表示关闭；角标显示默认 RPC 的未完成任务总数（下载中＋等待／暂停），最大显示 99，没有任务时隐藏。悬停可查看完整数量与接管状态。交接待确认时角标为橙色；数量未知或没有任务时显示 `?`。断线或切换服务会清除旧数量，开启管理页时复用其状态查询更新角标，页面关闭后每分钟更新一次；插件内添加、移除或接管任务也会主动刷新。

设置页的“外观”可选择浅色、深色或跟随系统，主题立即生效并自动保存在本地，也应用于工具栏弹出页、AriaNg 标签页与侧栏。RPC 和过滤规则需点击底部“保存设置”；连接测试结果显示在对应服务卡片内。

“AriaNg 偏好”集中提供管理界面语言、标题、刷新间隔、任务通知、快捷键、手势、拖拽、删除确认、重试行为、列表排序与详情显示；均自动保存。主题和普通偏好实时应用，刷新间隔修改会重新加载已打开的管理页（请先完成正在编辑的新任务）。原 AriaNg 设置页仅提供插件设置入口。RPC 方法／请求头、WebSocket 重连和调试模式不开放：本插件统一使用后台 HTTP POST，不保存额外 RPC 凭据或调试日志。配置备份目前只包含 RPC 与接管规则。

域名过滤支持精确域名和 `*.example.com`（仅子域，不包含 `example.com` 本身）；扩展名不区分大小写，支持 `tar.gz`。每行或逗号分隔，排除优先，允许列表为空表示不限制。

## 自动交接与恢复

仅接管来源可以唯一关联的 HTTP(S) GET 下载。POST、隐私窗口、扩展发起、`blob:`、`data:`、已完成或已暂停的任务以及无法确认容器／来源的任务继续由 Firefox 下载。同容器内并发同 URL 存在关联歧义时也保留浏览器任务。小文件可能在接管前完成。

交接流程为：持久化随机 GID → 暂停浏览器任务 → 持久化提交状态 → 添加 **暂停的** aria2 任务 → 确认 GID → 取消浏览器任务 → 启动 aria2。保留 Firefox 下载历史；交接前可能产生少量临时数据。

明确拒绝会尝试恢复浏览器下载。超时或响应丢失显示“交接待确认”，按 GID 查询，不直接再次提交。后台启动和每分钟 alarm 会恢复核对。设置页提供“重新查询”和“继续浏览器下载”；继续前先核对并停止 aria2 任务。查询不到 GID 时保留迟到任务的清理记录，这些 GID 永不启动。浏览器取消失败时尝试停止 aria2，未确认停止前保留冲突提示。原任务无法恢复时会提示从原页面重试。

未确认交接使用的 RPC 服务不能删除或修改地址／Secret，防止核对到错误服务器。完成记录保留最近 200 条。管理界面默认每秒刷新任务和速度，可在“AriaNg 偏好”调整；页面关闭后只保留每分钟的后台状态检查与交接恢复。

自动登录态转发使用 Firefox 在对应请求中**实际发送**的 Cookie、Referer 和 User-Agent，关联 `cookieStoreId`、顶层来源与完整重定向链，不使用当前活动标签页猜测，不拼接不同容器或分区的 Cookie。Cookie 转发默认关闭；HTTP Authorization、特殊验证码和绑定浏览器环境的认证下载不属于第一版保证范围。重定向使用最后一跳 URL 及其请求头。任务后续重定向由 aria2 处理；转发登录凭证时应确认下载服务和所配置 RPC 服务可信。

## 开发与构建

Node.js 24（最低 22）、pnpm 12.9.0、Firefox 140+。所有依赖版本和 pnpm 锁文件固定；AriaNg 的完整提交、官方 ZIP 校验值和文件校验值见 `vendor/ariang/provenance.json`。

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm dev
```

`pnpm dev -- --firefox=/path/to/firefox` 选择 Firefox。临时载入时选择 **`build/extension/manifest.json`**，不要选择源目录的 manifest（后台与页面脚本需构建）。`pnpm build` 生成 `dist/aria2_bridge-0.1.0.zip` 和 `dist/SHA256SUMS`。

AriaNg 原始发布资源及许可证保存在 `vendor/ariang/`，适配说明见 [ADAPTATION.md](vendor/ariang/ADAPTATION.md)。构建过程验证原始资源，启用 Angular CSP 解释器、移除 eval 分支，所有脚本、模板、字体与语言字典都随插件打包。AriaNg 只通过后台执行 RPC，不接触 Secret。旧版上游 DOM 写入静态告警保留明确基线，新增告警和任何错误均导致校验失败。

核心测试覆盖配置、规则、请求来源隔离、GID 持久化、暂停失败、明确拒绝、响应丢失、取消失败、后台重启与迟到任务。实机验收使用临时 Firefox 配置与临时 aria2 目录：

```sh
geckodriver --host 127.0.0.1 --port 4444
GECKODRIVER_URL=http://127.0.0.1:4444 FIREFOX_BINARY=/path/to/firefox pnpm test:firefox
```

具体覆盖与剩余人工验收项见 [验证记录](docs/VALIDATION.md)。CI 使用 `pnpm install --frozen-lockfile` 并上传未签名包。

## 隐私与发布

权限和数据流见 [隐私声明](docs/PRIVACY.md)。没有遥测、云同步、本地助手、域名 RPC 路由或媒体嗅探。签名和商店审核说明见 [发布说明](docs/RELEASE.md)。ZIP 是未签名开发包，不代表已经通过 Mozilla 签名或商店审核。
