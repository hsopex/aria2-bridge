# 验证记录

日期：2026-10-06（Asia/Shanghai）。在 Linux 上使用 Mozilla geckodriver 0.36.0、官方 Firefox 140.0 和本机 Firefox 157.0。Mozilla 的 [版本数据](https://product-details.mozilla.org/1.0/firefox_versions.json) 在验证时返回稳定版 157.0。

## 已执行

- `pnpm install --frozen-lockfile`（本次复验使用已下载依赖的 `--offline --store-dir .pnpm-store`）：锁文件冻结安装通过。
- `pnpm lint`：ESLint 无错误，构建校验上游哈希，web-ext 无错误；18 条明确基线告警（17 条固定上游库 DOM 写入，1 条仅桌面侧栏的 Android 兼容告警），新增告警会失败。
- `pnpm test`：35 项通过，包括真实 HTTP JSON-RPC 响应丢失／重定向拒绝测试，以及以下核心测试。
- `pnpm build`：生成未签名 ZIP 和 SHA256SUMS；在 dist 目录校验通过。

| 场景 | 验证方式／结果 |
| --- | --- |
| Firefox 140.0／157.0 加载 | 在全新临时 profile 安装未签名包，两者通过 |
| 设置界面与主题 | 两个 Firefox 版本验证浅色／深色／跟随系统选项保存、刷新后恢复、弹出页共享主题、窄窗口无横向溢出，以及新增／切换／删除默认 RPC 后保存，通过 |
| 右键菜单与快捷键 | 真实工具栏右键连续开关接管、添加弹出页、管理标签复用、RPC 子菜单切换；真实键盘开关接管／侧栏／添加入口；总开关释放和恢复原生绑定，配置校验、存储失败回滚和并发保存单元测试，通过 |
| 工具栏状态与任务角标 | 接管开关图标映射与悬停状态、真实 aria2 的 105 个暂停任务显示 99、移除后隐藏零任务、错误 Secret 清除旧数量、多 RPC 切换隔离；待确认颜色与数字并存及非法计数单元测试，通过 |
| 统一语言 | 单一控件切换简体中文／English，插件静态与动态文字、右键菜单、commands 描述、工具栏提示、原生 AriaNg、侧栏同步；切回中文恢复原文、未保存 RPC Secret 保留，通过 |
| AriaNg 偏好接管 | 插件控件保存、刷新恢复、全部原生字段应用、实时主题／语言、刷新间隔重载、原设置页无编辑控件、真实侧栏偏好一致、RPC 凭据不能写入偏好，通过 |
| AriaNg CSP 与模板 | 真实 Firefox 中完成 Angular CSP bootstrap、任务列表、新建、等待、完成、基本设置、状态路由渲染，通过 |
| 标签页与侧栏 | 实际 SidebarController 打开原生侧栏，同一管理文档与后台配置；管理标签页真实 RPC 连接通过 |
| HTTP RPC、错误 Secret | 两个独立临时 aria2 进程；正确 Secret 连通，错误 Secret 拒绝且不能开启接管，通过 |
| 多服务、目录归属 | 在两个本机 RPC 端点切换（127.0.0.1／localhost），选中服务的远程默认目录写入 aria2 task options，切换关闭接管，通过 |
| 手动批量、磁力、批量操作 | 真实 RPC 添加两个链接和磁力链接；递归认证 multicall 暂停、移除，通过 |
| 中文文件名、重定向、未知大小 | 真实 HTTP 下载夹具和 aria2，交接完成，保留浏览器取消历史，通过 |
| 同站点两个容器账户 | 两个 Firefox 容器，各自 Cookie 转发到相应 aria2 task options，未混合，通过 |
| 第三方分区 Cookie | 开启 Total Cookie Protection；跨站 iframe 中触发真实下载，正确顶层站点的 Cookie 转发，另一分区未转发，两个 Firefox 版本通过 |
| 并发同 URL／未知来源／POST／隐私 | 请求追踪单元测试确认保守跳过；不同容器同 URL 分别匹配，通过 |
| 过滤规则 | 排除优先、子域通配不匹配根域、扩展名大小写／复合扩展名／中文文件名，通过 |
| 暂停失败与恢复失败 | 故障注入确认暂停失败不提交，恢复失败显示重试，通过 |
| Firefox 暂停语义 | 确认 pause 内部取消传输，等待部分数据后 paused=true；零字节任务不提前暂停，真实交接与回归测试通过 |
| 提交拒绝、响应丢失、断网 | 故障注入和 HTTP 服务断开响应；保留暂停任务，用预生成 GID 核对，不重发，通过 |
| 取消失败、清理失败 | 确认停止 aria2 后才恢复；停止未确认时保留冲突，不启动重复下载，通过 |
| 后台重启 | 重新创建 Journal／Handoff，持久化 GID 恢复、取消后启动恢复、迟到任务清理，通过 |
| 用户取消竞态 | 取消前持久化 cancelling 意图，区分插件取消与用户取消；用户主动取消后不再启动 aria2，通过 |
| 远端轮换 Secret | code 1 不直接当成 GID 不存在，先验证授权；恢复不误判，通过 |
| Secret 保护 | 默认导出清空 Secret；RPC POST、省略请求站点 Cookie、拒绝 RPC 重定向；日志／持久化交接不含凭证，通过 |

实机脚本：`scripts/firefox-smoke.mjs`。进程禁用 aria2 用户配置，使用临时 Firefox profile、隔离的 HOME／XDG 目录和独立的远程实例名称、独立测试 Secret、临时下载目录；结束后删除临时数据。脚本会保留管理页与设置页的浅色／深色／窄窗口截图到 `dist/validation/`。不需要真实账户或用户的下载服务。

## 发布前人工验收

以下不能用当前本机夹具替代：用户实际远程 HTTP(S) 服务的证书／防火墙／代理、真实站点的复杂登录与验证码、Windows/macOS 文件系统差异、图形界面的日常使用和无障碍体验。特别是认证服务对 User-Agent、Cookie、IP、客户端证书或一次性 URL 的绑定，需在实际服务验证。

故障注入覆盖了后台重启状态恢复，尚未人为杀死真实 Firefox 后台进程做崩溃时序穷举。实机侧栏已打开，但所有任务操作尚未逐项在侧栏 UI 人工点击。真实互联网服务和 AMO 签名需要用户环境／凭据。ZIP 尚未签名；商店上架不在本次范围。

## 测试环境修正

旧版 Firefox 即使使用临时 profile，也可能在真实 HOME 下创建 `~/.mozilla/firefox/`，影响新版 Firefox 对 XDG 配置目录的选择（Mozilla bug 2003137）。实机脚本现使用临时启动包装器，将 geckodriver 的版本探测及 Firefox 子进程全部放入临时 HOME／XDG 目录，禁止远程实例复用，并在 Firefox 内断言环境隔离生效；测试结束一起清理。Firefox 140／157 复验通过，真实用户目录不再创建冲突的 `~/.mozilla/firefox/`。
