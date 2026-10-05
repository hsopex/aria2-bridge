# AriaNg 1.3.14 extension adaptation

The Standard release is vendored unmodified in `upstream/`. `provenance.json`
records the full source commit, official ZIP SHA-256 and every extracted file's
SHA-256. Builds reject changes to those files. The upstream MIT license is kept
here and in the packaged manager. Dependencies retain their upstream license
headers in the release bundle.

The maintained adaptation is `scripts/build.mjs` plus `src/ui/manager.js`:

- Remove automatic `ng-app` bootstrap; initialize after the background service
  supplies public connection metadata. Add explicit Angular `ng-csp` and cloak CSS.
- Remove JavaScript URLs. All scripts, compiled template-cache entries, fonts and
  language dictionaries remain local. There are no CDN dependencies.
- Remove legacy JSON eval fallback from ECharts. Remove Angular's eval probe and
  generated-function compiler, retaining the CSP expression interpreter.
- Replace HTTP and WebSocket transport factories with the same background RPC
  adapter. The manager receives no Secret and cannot put it in an RPC URL, debug
  log, localStorage or exported configuration. Legacy RPC command routes and debug
  UI are disabled. AriaNg RPC settings link to Bridge's single shared settings page.
- Replace the RPC selection menu with Bridge servers. Selecting one updates the
  default and disables auto takeover until deliberately enabled again. Tab/sidebar
  reload when Bridge configuration changes. Preserve all aria2 task and settings
  routes. Task and speed refresh intervals default to one second while open,
  configurable in Bridge with a one-second minimum. Interval changes reload open
  managers; other presentation preferences apply live.
- Bridge owns a versioned, allowlisted AriaNg preference store (language, title,
  notification, task interaction, sorting and detail display). Apply these through
  the original native setting service before bootstrap. Persist native sorting
  actions back to the same store. RPC fields, debug mode and native settings
  import/export remain inaccessible. The replaced settings route contains only
  the Bridge entry point.
- Use AriaNg's native light/dark/system theme implementation with Bridge's shared
  appearance preference; theme updates do not reload the manager. Tab and sidebar
  use the same storage listeners and native preference setters.

`lint-baseline.json` records only the pinned upstream DOM assignment warnings and
one intentional desktop-only sidebar compatibility warning. These DOM assignments
are in Angular's template rendering, third-party plugin rendering and ECharts
chart/tooltip rendering. They are not warnings introduced by Bridge code. This
baseline is a review aid, not a claim that the obsolete dependencies have undergone
an independent security audit. Unexpected warnings and all errors fail `pnpm lint`.
The CSP prohibits executable inline code and eval. Do not relax it to restore a
legacy feature. Re-review the baseline and run both Firefox versions when updating.

- Interface language is a single plugin preference (`managerPreferences.language`), shared with native AriaNg. Simplified Chinese is the default; Simplified Chinese and English are exposed because both have complete bundled Bridge labels. Extension-owned adapter text is explicitly marked for localization; native AriaNg dictionaries and user content are left to their own renderers.
