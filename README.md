# Aria2 Bridge

A download takeover extension for desktop Firefox 140+, connecting to an existing HTTP(S) aria2 JSON-RPC service and bundling the standard edition of AriaNg 1.3.14. Built with JavaScript, native `browser.*` APIs, Firefox background scripts and the native sidebar. There is no Chrome compatibility layer. The extension does not start aria2.

## Usage

1. Install a signed version, or temporarily load the built `manifest.json` at `about:debugging#/runtime/this-firefox`.
2. Open settings, enter the RPC URL (such as `http://127.0.0.1:6800/jsonrpc`), secret and default directory, then click **Save and test connection**. The directory is a path on **the machine running aria2**.
3. Add HTTP(S) URLs or magnet links from the toolbar popup, one per line, up to 100 at a time. You can also send webpage links through the context menu.
4. Click **Open AriaNg** to open the manager tab. An existing tab is reused. You can also open the sidebar from the toolbar popup or Firefox's sidebar menu. Both share the default RPC service and configuration.
5. After successfully testing the default service, enable automatic takeover. Switching the default service disables takeover; enable it again explicitly when ready.

Each RPC service has its own name, secret, directory and cookie forwarding switch. Manually pasted URLs have no source context and do not read authentication from other tabs. When cookie forwarding is enabled, sending a link through the context menu supports only same-origin links in the clicked, non-private top-level page. Cross-origin or iframe links require downloading from the source page, or disabling cookie forwarding to send them as public URLs.

Right-click the toolbar icon and open **Aria2 Bridge Quick Actions** to open the manager, add URLs, toggle the sidebar or takeover, open settings, test or refresh the connection, switch RPC services, or enable or disable action shortcuts. **Quick actions** in settings provides shortcut recording, suggested keys and a save button. Shortcuts are disabled and unassigned by default. The master switch preserves assignments while releasing or restoring the keys; it does not affect context menus, accepted tasks or the download takeover switch. AriaNg's internal shortcuts are controlled separately under **AriaNg preferences**. Enabling takeover still requires a successful test of the default RPC service; switching services disables takeover.

The toolbar icon is green when automatic takeover is enabled and gray when disabled. Its badge shows the default RPC service's unfinished task count (downloading plus waiting or paused), capped at 99 and hidden when there are no tasks. Hover over the icon for the full count and takeover status. Unconfirmed handoffs make the badge orange; when the count is unknown or zero, it displays `?`. Disconnecting or switching services clears stale counts. An open manager page supplies status updates; otherwise, the background checks once per minute. Adding, removing or handing off tasks through the extension also refreshes the count.

Under **Appearance**, choose Light, Dark or System. Theme changes take effect immediately, are saved locally, and apply to the toolbar popup, AriaNg tabs and the sidebar. RPC settings and filters require clicking **Save settings** at the bottom. Connection test results appear in the corresponding service card. Each settings menu opens its own panel; URL hashes and browser Back/Forward navigation select panels while preserving unsaved edits.

**Appearance → Interface language** controls both the extension and AriaNg. Simplified Chinese and English are available, with Simplified Chinese as the default. Changes apply to settings, the popup, context menus, notifications, toolbar tooltips, manager tabs and the sidebar without overwriting unsaved inputs. There is only one language setting; an existing English preference is retained as the shared language.

**AriaNg preferences** centralizes titles, refresh intervals, task notifications, shortcuts, gestures, drag-and-drop, removal confirmation, retry behavior, list sorting and task details. Changes are saved automatically. Themes and ordinary preferences apply live; changing refresh intervals reloads open manager pages, so finish editing new tasks first. The original AriaNg settings page provides an entry point to extension settings. RPC methods and headers, WebSocket reconnection and debug mode are not configurable: the extension consistently uses background HTTP POST and stores no additional RPC credentials or debug logs. Configuration backups currently include only RPC settings and takeover rules.

Domain filters support exact domains and `*.example.com` (subdomains only, excluding `example.com` itself). Extension filters are case-insensitive and support compound extensions such as `tar.gz`. Separate entries with lines or commas. Exclusions take priority; an empty allow list imposes no restriction.

## Download confirmation

Under **Download takeover**, enable **Ask before each download** and save settings. It is off by default to preserve automatic behavior. Eligible automatic handoffs and context-menu sends then open a confirmation window where you can choose a tested RPC service, change the remote directory and filename, or keep the new aria2 task paused. These overrides apply to that task only. Filenames must not contain directory separators; torrent and magnet contents retain the filenames defined by the torrent.

For automatic handoffs, Firefox pauses the original download before asking. Nothing is submitted to aria2 until you confirm. Choosing **Resume browser download**, closing the window or failing to open it keeps the task in Firefox. A background restart resumes downloads still awaiting a choice without submitting them. Each concurrent download has its own confirmation; request headers remain in memory and are never included in the confirmation URL or handoff journal.

The toolbar's manual add form also has an **Options for this download** section for directory, filename and pause state. A custom filename is available for a single URL; batch additions share the chosen directory and pause state. AriaNg's own new-task page retains its native controls.

## Automatic handoff and recovery

Only HTTP(S) GET downloads whose source can be uniquely associated are taken over. POST requests, private downloads, extension-initiated downloads, `blob:` and `data:` URLs, completed or paused tasks, and tasks with uncertain container or source information stay in Firefox. Concurrent downloads of the same URL in the same container also remain in the browser when their source association is ambiguous. Small files may finish before takeover begins.

The handoff sequence is: persist a random GID → pause the browser task → persist submission state → add a **paused** aria2 task → confirm the GID → cancel the browser task → start aria2. Firefox download history is preserved. A small amount of temporary data may be created before handoff.

An explicit rejection attempts to resume the browser download. A timeout or lost response leaves the handoff unconfirmed: the extension checks the GID instead of submitting again. Reconciliation runs when the background starts and on its once-per-minute alarm. Settings provides **Recheck** and **Resume browser download**; resuming first checks and stops the aria2 task. If the GID cannot be found, a cleanup record is retained for late-arriving tasks, and those GIDs are never started. If browser cancellation fails, the extension attempts to stop aria2 and retains a conflict notice until the stop is confirmed. If the original browser task cannot resume, you are prompted to retry from the source page.

RPC services used by unconfirmed handoffs cannot be removed or have their URL or secret changed, preventing reconciliation against the wrong server. The latest 200 completed records are retained. The manager refreshes tasks and speeds every second by default; adjust this under **AriaNg preferences**. Once manager pages close, only the background's once-per-minute status check and handoff recovery remain active.

Automatic authentication forwarding uses the Cookie, Referer and User-Agent headers that Firefox **actually sent** on the associated request. It correlates `cookieStoreId`, the top-level origin and the complete redirect chain, without guessing from the active tab or combining cookies across containers or partitions. Cookie forwarding is disabled by default. HTTP Authorization, special CAPTCHA flows and authentication tied to the browser environment are outside the first version's guarantees. Redirected downloads use the final observed URL and its request headers; subsequent redirects are handled by aria2. When forwarding credentials, ensure that you trust both the download service and the configured RPC service.

## Development and build

Node.js 24 (minimum 22), pnpm 12.9.0 and Firefox 140+ are required. Dependency versions and the pnpm lockfile are pinned. AriaNg's full commit, official ZIP checksum and individual file checksums are recorded in `vendor/ariang/provenance.json`.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm dev
```

Use `pnpm dev -- --firefox=/path/to/firefox` to select Firefox. For temporary loading, choose **`build/extension/manifest.json`**, rather than the source manifest: background and page scripts must be built first. `pnpm build` generates `dist/aria2_bridge-0.1.0.zip` and `dist/SHA256SUMS`.

AriaNg's original release resources and license are preserved in `vendor/ariang/`. See [ADAPTATION.md](vendor/ariang/ADAPTATION.md) for adaptation details. The build verifies upstream resources, enables Angular's CSP interpreter and removes eval branches. All scripts, templates, fonts and language dictionaries are bundled. AriaNg executes RPC only through the background and never receives the secret. Static warnings about upstream DOM writes have an explicit baseline; any new warning or error fails validation.

Core tests cover configuration, filters, request-source isolation, GID persistence, pause failures, explicit rejections, lost responses, cancellation failures, background restarts and late-arriving tasks. Browser verification uses temporary Firefox profiles, isolated HOME/XDG directories and temporary aria2 directories:

```sh
geckodriver --host 127.0.0.1 --port 4444
GECKODRIVER_URL=http://127.0.0.1:4444 FIREFOX_BINARY=/path/to/firefox pnpm test:firefox
```

See the [validation record](docs/VALIDATION.md) for detailed coverage and remaining manual checks. CI uses `pnpm install --frozen-lockfile` and uploads an unsigned package.

## Privacy and release

See the [privacy statement](docs/PRIVACY.md) for permissions and data flows. There is no telemetry, cloud sync, local helper, domain-based RPC routing or media sniffing. See the [release guide](docs/RELEASE.md) for signing and store review instructions. The ZIP is an unsigned development package and has not necessarily passed Mozilla signing or store review.
