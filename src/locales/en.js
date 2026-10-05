// Source phrases are Chinese; longest-match translation also handles dynamic counts.
export const english = Object.fromEntries(`
目录属于 aria2 所在机器。关闭此窗口会取消发送，不创建 aria2 任务。|The directory is on the aria2 machine. Closing this window cancels sending without creating an aria2 task.
设置菜单|Settings menu
下载确认|Download confirmation
这次下载如何保存？|How should this download be saved?
目录属于 aria2 所在机器。关闭此窗口会保留并恢复浏览器下载。|The directory is on the aria2 machine. Closing this window keeps and resumes the browser download.
下载目录|Download directory
留空使用 aria2 默认目录|Leave blank to use aria2's default directory
留空使用原文件名|Leave blank to use the original filename
只填写文件名，不包含目录；磁链和种子内容的文件名由种子决定。|Enter a filename without a directory. Magnet and torrent contents use filenames from the torrent.
发送后保持暂停|Keep paused after adding
先添加到 aria2，稍后从管理页开始下载。|Add to aria2 now and start later from the manager.
正在加载下载信息…|Loading download details…
大小未知|Size unknown
取消发送|Cancel
确认后才会发送，当前尚未提交 aria2|Nothing has been sent to aria2. Confirm to send.
每次下载前询问|Ask before each download
自动接管和右键发送时，先选择服务、目录、文件名及是否暂停。|For automatic takeover and context-menu sends, choose a service, directory, filename and pause state first.
常用动作与键盘快捷键|Common actions and keyboard shortcuts
管理标签页与侧栏的共享偏好|Shared preferences for manager tabs and the sidebar
连接与管理你的 aria2 服务|Connect and manage your aria2 services
选择自动发送或每次询问|Choose automatic sending or confirmation each time
决定哪些下载由 aria2 接管|Choose which downloads aria2 takes over
备份与恢复服务配置|Back up and restore service configuration
核对每次下载的处理状态|Check the status of each download
主题和语言在“外观”中设置。|Set theme and language under Appearance.
在“RPC 服务”中管理。|Configure these under RPC services.
下载选项无效|Invalid download options
下载目录无效|Invalid download directory
文件名不能包含路径分隔符或换行|Filenames cannot contain path separators or line breaks
暂停选项无效|Invalid pause option
询问选项无效|Invalid confirmation option
询问已结束，浏览器下载已恢复或已处理|This confirmation has ended; the browser download was resumed or handled
自定义文件名仅适用于单个链接|A custom filename can only be used with one URL
请先成功测试所选 RPC，再发送下载|Test the selected RPC successfully before sending the download
等待选择下载方式，尚未发送 aria2|Waiting for your choice; nothing sent to aria2
已选择浏览器下载，未提交 aria2|Browser download selected; nothing sent to aria2
询问失败，已恢复浏览器下载|Confirmation failed; browser download resumed
本次下载选项|Options for this download
主题和语言在“外观”中设置。刷新间隔修改后，已打开的管理页会重新加载；其他偏好立即生效。任务通知仅在管理页打开时有效，声音是否播放由系统决定。RPC 地址、Secret、目录与服务选择在“RPC 服务”中管理。|Set theme and language under Appearance. Refresh interval changes reload open managers; other preferences apply immediately. Task notifications require an open manager; sound depends on your system. Manage RPC addresses, secrets, directories and services under RPC services.
界面语言|Interface language
语言应用于插件页面、右键菜单、通知及 AriaNg 标签页和侧栏。|Language applies to extension pages, context menus, notifications, AriaNg tabs and the sidebar.
界面语言已自动保存|Interface language saved
语言保存失败，请重试|Could not save language. Please try again.
Aria2 Bridge 设置|Aria2 Bridge Settings
Aria2 Bridge 快捷操作|Aria2 Bridge Quick Actions
Firefox 下载助手|Firefox download assistant
设置导航|Settings navigation
外观|Appearance
快捷操作|Quick actions
AriaNg 偏好|AriaNg preferences
RPC 服务|RPC services
下载接管|Download takeover
过滤规则|Filters
配置备份|Configuration backup
交接记录|Handoff history
偏好设置|Preferences
让下载按你的方式运行|Downloads, your way
管理连接、下载接管与界面外观。|Manage connections, download takeover and appearance.
选择适合你的界面主题，修改后立即生效。|Choose your theme. Changes take effect immediately.
自动保存|Saved automatically
界面主题|Theme
跟随系统|System
浅色模式|Light
深色模式|Dark
主题应用于设置页、工具栏弹出页以及 AriaNg 标签页与侧栏。跟随系统时，界面会随系统外观切换。|The theme applies to settings, the toolbar popup, AriaNg tabs and the sidebar. System follows your system appearance.
右键工具栏图标可使用常用功能；也可设置 Firefox 全局快捷键。|Right-click the toolbar icon for common actions, or assign Firefox keyboard shortcuts.
启用功能快捷键|Enable action shortcuts
关闭后释放按键，保留配置；右键菜单仍可使用。|Disabling releases the keys and keeps your assignments. Context menus remain available.
保存快捷键|Save shortcuts
填入建议按键|Fill suggested keys
聚焦输入框后按下组合键，也可手动输入，例如 Alt+Shift+M。按退格键或删除键清空，留空表示不绑定。与 Firefox、系统或其他扩展冲突的按键可能无法触发，请改用其他组合。这里的总开关仅控制功能快捷键；管理页内部快捷键在“AriaNg 偏好”中设置。|Focus a field and press a key combination, or type one such as Alt+Shift+M. Backspace or Delete clears the binding. Conflicts with Firefox, your system or other extensions may prevent activation. This switch controls action shortcuts; AriaNg's internal shortcuts are in AriaNg preferences.
统一管理标签页与侧栏的原生偏好，修改后自动保存。|Manage shared tab and sidebar preferences. Changes are saved automatically.
正在加载管理界面设置…|Loading manager preferences…
主题使用上方“外观”。刷新间隔修改后，已打开的管理页会重新加载；其他偏好立即生效。任务通知仅在管理页打开时有效，声音是否播放由系统决定。RPC 地址、Secret、目录与服务选择由下方 RPC 配置管理。|Set the theme under Appearance. Refresh interval changes reload open manager pages; other preferences apply immediately. Task notifications require an open manager page; sound depends on your system. Configure RPC addresses, secrets, directories and service selection below.
连接已有的 aria2，可添加多个服务并指定默认连接。|Connect to existing aria2 servers and choose a default service.
添加服务|Add service
正在加载连接配置…|Loading connection settings…
Secret 仅保存在当前 Firefox 配置中，不包含在导出文件里。开启 Cookie 转发后，登录凭证会发送给选定的 RPC 服务。|Secrets stay in this Firefox profile and are excluded from exports. Cookie forwarding sends login credentials to the selected RPC service.
将符合条件的浏览器下载交给默认 aria2 服务。|Send eligible browser downloads to the default aria2 service.
自动接管下载|Automatic download takeover
请先成功测试默认 RPC，再启用此选项。|Test the default RPC connection successfully before enabling this option.
仅接管来源明确的 HTTP(S) GET 下载。隐私窗口、POST 和无法可靠确认登录态的任务继续由 Firefox 下载。|Only HTTP(S) GET downloads with a verified origin are taken over. Private downloads, POST requests and downloads with uncertain authentication stay in Firefox.
排除规则优先；允许列表为空时不限制。每行或逗号分隔。|Exclusions take priority. Empty allow lists impose no restriction. Separate entries with lines or commas.
允许域名|Allowed domains
排除域名|Excluded domains
允许扩展名|Allowed extensions
排除扩展名|Excluded extensions
精确域名或 *.域名，仅匹配子域名。|Use exact domains or *.domain to match subdomains only.
这些站点的下载继续由浏览器处理。|Downloads from these sites stay in the browser.
忽略大小写，支持 tar.gz 等复合扩展名。|Case-insensitive. Compound extensions such as tar.gz are supported.
即使符合允许规则，也不会接管。|Never take over these downloads, even if allowed elsewhere.
导出已保存的配置，或从 JSON 文件恢复。导入会替换现有服务与规则。|Export saved settings or restore a JSON file. Import replaces existing services and filters.
导出配置|Export settings
导入配置|Import settings
导出文件不包含 Secret，自动接管默认关闭。导入后请重新填写 Secret 并测试连接。|Exports exclude secrets and disable takeover. Enter secrets and test connections after importing.
核对下载去向，处理尚未确认的交接。|Check download destinations and resolve unconfirmed handoffs.
刷新记录|Refresh history
待确认时不会重复提交。继续浏览器下载前会核对并停止 aria2 任务；原任务不能恢复时，请从原页面重试。|Unconfirmed tasks are never resubmitted. Resuming the browser first checks and stops the aria2 task. If the original cannot resume, retry from the source page.
正在加载设置…|Loading settings…
保存设置|Save settings
文件保存到 aria2 所在机器，而非当前浏览器的下载目录。|Files are saved on the aria2 machine, rather than in this browser's download directory.
默认 RPC|Default RPC
测试连接|Test connection
正在查询任务数量…|Checking task count…
正在连接…|Connecting…
添加链接／磁力链接（每行一个）|Add URLs / magnet links (one per line)
发送到 aria2|Send to aria2
打开 AriaNg|Open AriaNg
侧栏|Sidebar
设置与交接记录|Settings and handoff history
有未保存的更改|Unsaved changes
连接与规则已保存|Connections and filters saved
未命名服务|Unnamed service
默认下载目录|Default download directory
默认|Default
服务名称|Service name
给这台 aria2 起一个易于识别的名字。|Give this aria2 server a recognizable name.
RPC 地址|RPC URL
HTTP(S) JSON-RPC，例如 http://127.0.0.1:6800/jsonrpc|HTTP(S) JSON-RPC, e.g. http://127.0.0.1:6800/jsonrpc
未设置 Secret 时可留空。|Leave blank if no secret is configured.
aria2 所在机器的路径，留空使用服务默认目录。|A path on the aria2 machine. Leave blank to use the server's default directory.
例如：家里的 NAS|e.g. Home NAS
设为默认服务|Use as default service
转发来源 Cookie|Forward source cookies
保存并测试连接|Save and test connection
尚未测试|Not tested
配置已修改，请重新测试|Settings changed. Test again.
删除|Remove
服务已从编辑列表移除，保存后生效|Service removed from the editor. Save to apply.
正在保存…|Saving…
正在保存并连接…|Saving and connecting…
配置已保存|Settings saved
连接成功，现在可以启用自动接管|Connected. You can now enable automatic takeover.
最多可配置 20 个服务|At most 20 services can be configured
新服务|New service
界面主题已自动保存|Theme saved
主题保存失败，请重试|Could not save theme. Please try again.
已导出保存的配置，不包含 Secret；导出文件中自动接管为关闭|Saved settings exported without secrets; takeover is disabled in the export
请等待当前保存操作结束|Wait for the current save to finish
配置文件过大|Configuration file is too large
已导入，请填写 Secret 并测试连接|Imported. Enter secrets and test connections.
请在 Firefox 中允许此扩展显示通知后重试|Allow this extension to display notifications in Firefox and try again
未绑定 · 按组合键或输入|Unassigned · press keys or type
已恢复此快捷键|Shortcut restored
有未保存的快捷键更改|Unsaved shortcut changes
快捷键已启用，编辑的按键需保存后生效|Shortcuts enabled. Save edited bindings to apply them.
快捷键已保存并启用|Shortcuts saved and enabled
快捷键已保存并停用，按键已释放|Shortcuts saved and disabled; keys released
快捷键已停用，绑定已保留|Shortcuts disabled; assignments preserved
快捷键已启用|Shortcuts enabled
已填入建议按键，保存后生效|Suggested keys filled. Save to apply.
语言与页面|Language and page
管理界面语言|Interface language
RPC 服务菜单顺序|RPC service menu order
默认服务优先|Default service first
按服务名称|By service name
管理标签页标题|Manager tab title
支持|Supports
标题刷新间隔|Title refresh interval
速度与全局状态刷新间隔|Speed and global statistics refresh interval
任务信息刷新间隔|Task refresh interval
通知与操作|Notifications and actions
AriaNg 任务通知（管理页打开时）|AriaNg task notifications (while manager is open)
通知声音|Notification sound
通知频率|Notification frequency
不限制|Unlimited
每分钟最多 10 次|At most 10 times per minute
每分钟最多 1 次|At most once per minute
每 5 分钟最多 1 次|At most once per 5 minutes
键盘快捷键|Keyboard shortcuts
滑动手势|Swipe gestures
拖拽调整任务顺序|Drag to reorder tasks
删除任务前确认|Confirm before removing tasks
重试后移除旧任务|Remove old task after retrying
新建任务后|After creating a task
转到任务列表|Go to task list
转到任务详情|Go to task details
重试任务后|After retrying a task
转到下载中列表|Go to downloading list
留在当前页面|Stay on current page
列表与详情|Lists and details
各任务列表使用独立排序|Use independent sorting for each task list
下载中／共享列表排序|Downloading / shared list order
等待列表排序（独立排序时）|Waiting list order (when independent)
已停止列表排序（独立排序时）|Stopped list order (when independent)
文件列表排序|File list order
连接列表排序|Peer list order
复制详情时包含字段名称|Include field names when copying details
详情页显示分块信息|Show pieces in task details
始终显示|Always
分块不超过 102,400|Up to 102,400 pieces
分块不超过 10,240|Up to 10,240 pieces
分块不超过 1,024|Up to 1,024 pieces
不显示|Never
默认顺序|Default order
文件名|Filename
大小|Size
进度|Progress
剩余时间|Time remaining
下载速度|Download speed
上传速度|Upload speed
地址|Address
客户端|Client
选择状态|Selection
升序| (ascending)
降序| (descending)
 秒| seconds
打开／关闭侧栏|Toggle sidebar
开启／关闭自动接管|Toggle automatic takeover
打开设置与交接记录|Open settings and handoff history
测试默认 RPC 连接|Test default RPC connection
刷新连接与任务数量|Refresh connection and task count
添加链接／磁力链接|Add URLs / magnet links
切换默认 RPC|Switch default RPC
发送到 Aria2 Bridge|Send to Aria2 Bridge
任务数量未知|Task count unknown
下载中|Downloading
等待／暂停|Waiting / paused
未完成|Unfinished
（已达显示上限）| (display limit reached)
 个交接待确认：在设置页核对| unconfirmed handoffs: check Settings
 个交接待确认，请打开设置核对| unconfirmed handoffs: check Settings
已添加|Added
被拒绝|Rejected
结果待确认，请勿重复发送|Unconfirmed result. Do not send again.
连接成功|Connected
，现在可以开启接管|; you can now enable takeover
自动接管|Automatic takeover
已开启| enabled
已关闭| disabled
尚未连接|Not connected
已连接|Connected
正在连接|Connecting
连接失败，请检查地址、Secret 和网络|Connection failed. Check the URL, secret and network.
后台未响应|Background did not respond
重新查询|Recheck
继续浏览器下载|Resume browser download
暂无自动交接记录|No automatic handoffs yet
下载 |Download 
交接正在执行，请完成后再修改 RPC 地址和 Secret|A handoff is running. Wait before changing the RPC URL or secret.
有未确认交接，暂不能删除或修改其 RPC 地址和 Secret|Unconfirmed handoffs prevent removal or changes to their RPC URL or secret.
请先成功测试默认 RPC，再开启自动接管|Test the default RPC connection successfully before enabling takeover
每次请添加 1–100 个链接|Add 1–100 URLs at a time
RPC 服务不存在|RPC service does not exist
未知快捷功能|Unknown shortcut action
未知内部请求|Unknown internal request
此链接无法可靠读取登录态；请关闭 Cookie 转发后发送，或从原页面下载|Cannot safely determine authentication for this link. Disable cookie forwarding or download from the source page.
已发送到 aria2|Sent to aria2
发送结果待核对，GID：|Result needs confirmation, GID: 
；请勿直接重复发送|; do not send again
后台操作失败，请打开交接记录核对；浏览器下载未被主动删除|Background action failed. Check handoff history. Browser downloads were not removed.
后台未就绪，请重新打开 AriaNg 或在插件设置中检查配置。|Background not ready. Reopen AriaNg or check extension settings.
AriaNg 主题、语言、通知、列表与操作偏好，以及 RPC 和下载接管配置，均由插件设置统一管理。标签页与侧栏共用。|AriaNg theme, language, notifications, lists, actions, RPC and download takeover are managed in extension settings and shared by tabs and the sidebar.
所有脚本、模板和语言资源均已内置。|All scripts, templates and language resources are bundled.
管理界面设置格式错误|Invalid manager preference format
不支持的管理界面设置：|Unsupported manager preference: 
管理界面设置无效：|Invalid manager preference: 
快捷键格式错误|Invalid shortcut format
快捷键配置格式错误|Invalid shortcut configuration
未知快捷功能|Unknown shortcut action
多个功能不能使用同一个快捷键|Actions cannot share the same shortcut
请使用字母、数字、F1–F19 或方向等常用按键|Use letters, numbers, F1–F19 or common keys such as arrows
请搭配 Ctrl、Alt 或 Command；F1–F19 可单独使用|Use Ctrl, Alt or Command. F1–F19 can be used alone.
修饰键重复|Duplicate modifier
不支持的配置版本|Unsupported configuration version
请配置 1–20 个 RPC 服务|Configure 1–20 RPC services
RPC 标识无效或重复|Invalid or duplicate RPC ID
RPC 配置字段无效|Invalid RPC configuration field
RPC 地址必须是 HTTP(S)，不能包含账户、查询参数或片段|RPC URL must use HTTP(S), with no credentials, query or fragment
默认 RPC 不存在|Default RPC does not exist
过滤规则无效|Invalid filters
过滤规则必须为字符串|Filters must be strings
域名规则只能使用域名或 *.域名|Domain filters must use a domain or *.domain
扩展名规则无效|Invalid extension filter
链接无效|Invalid URL
磁力链接缺少 xt|Magnet link has no xt parameter
只支持 HTTP(S) 和磁力链接|Only HTTP(S) and magnet links are supported
本机 aria2|Local aria2
RPC 参数必须为数组|RPC parameters must be an array
RPC 方法无效|Invalid RPC method
批量 RPC 参数无效|Invalid batch RPC parameters
不支持的 RPC 方法|Unsupported RPC method
RPC 连接中断或响应无法确认|RPC connection lost or response unconfirmed
aria2 拒绝请求|aria2 rejected the request
暂停失败，保留浏览器下载|Pause failed; browser download preserved
浏览器暂停状态未确认，未提交 aria2|Browser pause unconfirmed; not submitted to aria2
交接状态无法保存，未提交 aria2|Cannot persist handoff state; not submitted to aria2
返回 GID 不一致，交接待确认|Returned GID differs; handoff unconfirmed
RPC 响应丢失，交接待确认；不会重复提交|RPC response lost; handoff unconfirmed. No resubmission.
提交失败，已恢复浏览器下载|Submission failed; browser download resumed
浏览器恢复失败，请从原页面重试|Browser resume failed. Retry from the source page.
浏览器任务已结束，请从原页面重试|Browser task ended. Retry from the source page.
浏览器取消失败，aria2 已停止，已恢复浏览器下载|Browser cancellation failed; aria2 stopped and browser download resumed
浏览器取消失败，aria2 停止状态待确认|Browser cancellation failed; aria2 stop unconfirmed
浏览器已取消，aria2 启动状态待确认|Browser cancelled; aria2 start unconfirmed
已交给 aria2；浏览器历史记录保留|Sent to aria2; browser download history preserved
原 RPC 配置不可用，交接待确认|Original RPC configuration unavailable; handoff unconfirmed
浏览器下载已完成，未提交 aria2|Browser download completed; not submitted to aria2
后台重启，未提交 aria2，已恢复浏览器下载|Background restarted; not submitted to aria2, browser download resumed
无法核对 GID，交接待确认|Cannot check GID; handoff unconfirmed
已继续浏览器下载；后台继续清理迟到的暂停任务|Browser download resumed; background will clean up late paused tasks
无法确认 aria2 已停止，尚未恢复浏览器下载|Cannot confirm aria2 stopped; browser download has not resumed
冲突已解除，已恢复浏览器下载|Conflict resolved; browser download resumed
无法恢复浏览器下载，请从原页面重试|Cannot resume browser download. Retry from the source page.
aria2 任务已停止，已恢复浏览器下载|aria2 task stopped; browser download resumed
aria2 任务已停止，请从原页面重试|aria2 task stopped. Retry from the source page.
GID 尚不可见，交接待确认；不会重新提交|GID not yet visible; handoff unconfirmed. No resubmission.
aria2 已停止，已继续浏览器下载|aria2 stopped; browser download resumed
已继续浏览器下载；不会重新提交或启动此 GID|Browser download resumed; this GID will not be resubmitted or started
浏览器任务已完成或被用户取消，aria2 已停止|Browser task completed or cancelled by the user; aria2 stopped
浏览器任务已改变，aria2 任务已停止；请检查下载记录|Browser task changed; aria2 task stopped. Check download history.
浏览器任务已改变，aria2 停止状态待确认|Browser task changed; aria2 stop unconfirmed
aria2 停止状态仍待确认|aria2 stop still unconfirmed
交接待确认|Handoff unconfirmed
已保存| saved
`.trim().split('\n').map(line => { const at = line.indexOf('|'); return [line.slice(0, at), line.slice(at + 1)]; }));
