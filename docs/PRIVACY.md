# 权限与数据声明

Aria2 Bridge 不向开发者、分析平台或云同步服务发送数据。请求只发送到用户配置的 RPC 服务，以及 aria2 下载任务所指向的站点。内置 AriaNg 的外部帮助链接只有用户点击时才打开。

## 权限用途

| 权限 | 用途 |
| --- | --- |
| storage | 本地保存版本化配置、界面主题、AriaNg 偏好、快捷键配置、RPC Secret、连接测试标记、GID 交接记录 |
| downloads | 观察下载、暂停、取消、恢复与核对历史状态；不删除历史记录 |
| webRequest | 非阻断观察 GET／POST、来源、重定向和实际发送的请求头；不开启接管时不缓存请求 |
| cookies | 对右键所点击的、非隐私顶层同源链接读取明确 Cookie 容器与分区；仅在该 RPC 开启 Cookie 转发时使用 |
| contextualIdentities | 识别并访问 Firefox 容器的 cookieStoreId；不改变用户的容器设置 |
| menus | 链接右键“发送到 Aria2 Bridge” |
| alarms | 页面关闭后每分钟状态更新与未确认交接恢复 |
| notifications | 显示交接失败、冲突和需要重试的提示 |
| tabs | 打开／复用管理标签页和识别所点击的来源；不查询活动标签页推断自动下载登录态 |
| HTTP(S) 主机权限 | 连接任意用户配置的 RPC，并观察下载来源请求 |

使用 Firefox 原生 `sidebar_action` 提供侧栏。无需 `webRequestBlocking`、内容脚本或网页可访问的扩展资源。

## 数据处理

- 快捷键按键录入仅监听设置页的快捷键输入框，不记录网页输入。全局功能通过 Firefox 原生 commands API 触发，无需内容脚本或新增权限。

- 界面主题、AriaNg 偏好和快捷键配置仅保存在扩展本地存储，AriaNg 原生服务使用 localStorage 保存相应偏好，主题还使用 localStorage 缓存以减少启动时的闪烁；不发送到 RPC 服务。

- Secret 随 JSON-RPC POST 的 token 参数发送到选定 RPC；不放在 URL、日志和默认导出文件中。配置地址禁止内嵌用户名密码、查询参数和 URL 片段。RPC 请求省略 Firefox 自身的 RPC 站点 Cookie，禁止自动重定向 RPC 请求。
- RPC 接收任务 URL、文件名和远程目录，以及用户在 AriaNg 中提交的任务参数。任务 URL 本身可能含下载令牌。
- Cookie 转发默认关闭。开启时自动任务仅发送对应实际请求头中的 Cookie；Referer、User-Agent 随明确来源转发。右键 Cookie 读取使用被点击标签页的 cookieStoreId 和顶层站点，不合并其他容器／账户的 Cookie。有歧义时不发送。
- 暂存的观察记录只在后台内存中保存最多 90 秒，禁用接管时清空；不保存到磁盘，不写日志。隐私请求不缓存，隐私下载不自动接管。
- 持久化交接记录只含浏览器下载 ID、RPC ID／地址、GID、文件名、状态、提示和时间；不含 Cookie、Secret 或下载 URL。最近 200 条完成记录保留，未确认记录保留用于恢复。
- 用户可导出配置（Secret 清空，接管关闭）、导入配置、删除不处于交接中的 RPC 服务。卸载扩展会移除扩展本地存储；aria2 已接收的任务与远程文件由用户在 aria2／AriaNg 中管理。

清单声明 `authenticationInfo`、`browsingActivity` 和 `websiteContent`，对应登录凭证、下载来源／URL 与用户提交的任务内容向指定 RPC 的转发。声明“none”不符合实际行为。

- 下载确认窗口仅显示来源域名、大小、文件名及所选 RPC 的目录。窗口 URL 只含随机确认标识，不含任务 URL、Cookie 或 Secret；询问期间实际请求头仅保留在后台内存，重启后恢复浏览器下载。每次任务的目录和文件名不会修改服务默认设置。
