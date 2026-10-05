import { translateText } from '../core/language.js';
import { preferenceFields, preferenceSetter } from '../core/manager-preferences.js';
import { send } from './common.js';

/* Adapter loaded after the pinned AriaNg app and before manual Angular bootstrap.
 * Native browser messages are the only RPC transport; AriaNg never gets a secret.
 */
async function start() {
  const [config, preferences, { appearance }] = await Promise.all([send('CONFIG_PUBLIC'), send('MANAGER_PREFERENCES_GET'), browser.storage.local.get('appearance')]);
  let theme = appearance?.theme || 'system';
  let settingService;
  const originalSetters = new Map();
  function applyPreferences() {
    for (const field of preferenceFields) originalSetters.get(field.key)?.(preferences[field.key]);
    settingService.setTheme(theme);
    // AriaNg uses one setter with a page argument for all three task lists.
    originalSetters.get('displayOrder')?.(preferences.displayOrder, 'downloading');
    if (preferences.taskListIndependentDisplayOrder) {
      originalSetters.get('displayOrder')?.(preferences.waitingTaskListPageDisplayOrder, 'waiting');
      originalSetters.get('displayOrder')?.(preferences.stoppedTaskListPageDisplayOrder, 'stopped');
    }
  }
  const menuServers = () => [...config.servers].sort((a, b) => preferences.rpcListDisplayOrder === 'rpcAlias' ? a.name.localeCompare(b.name, undefined, { numeric: true }) : Number(b.id === config.defaultServerId) - Number(a.id === config.defaultServerId));
  const selected = config.servers.find(s => s.id === config.defaultServerId);
  const app = angular.module('ariaNg');
  const settingsTemplate = '<section class="content"><h2>Aria2 Bridge</h2><p data-bridge-i18n>AriaNg 主题、语言、通知、列表与操作偏好，以及 RPC 和下载接管配置，均由插件设置统一管理。标签页与侧栏共用。</p><button data-bridge-i18n class="btn btn-primary" ng-click="openBridgeSettings()">打开设置与交接记录</button><hr><p data-bridge-i18n>AriaNg 1.3.14 · 所有脚本、模板和语言资源均已内置。</p></section>';
  app.config(['$provide', '$compileProvider', '$routeProvider', function ($provide, $compileProvider, $routeProvider) {
    $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|tel|file|blob|magnet|moz-extension):/);
    for (const path of ['/settings/ariang', '/settings/ariang/:extendType']) $routeProvider.when(path, { template: settingsTemplate });
    for (const path of ['/settings/rpc/set', '/settings/rpc/set/:protocol/:host/:port/:interface/:secret?', '/debug']) $routeProvider.when(path, { redirectTo: '/settings/ariang' });
    $provide.decorator('ariaNgSettingService', ['$delegate', function (service) {
      service.getCurrentRpcSecret = () => '';
      service.isCurrentRpcUseWebSocket = () => false;
      service.getCurrentRpcUrl = () => selected.url;
      service.getCurrentRpcDisplayName = () => selected.name;
      service.getCurrentRpcHttpMethod = () => 'POST';
      service.getCurrentRpcRequestHeaders = () => '';
      service.getAllRpcSettings = () => [{ rpcId: selected.id, rpcAlias: selected.name, isDefault: true }];
      settingService = service;
      for (const field of preferenceFields) {
        const method = preferenceSetter(field.key);
        if (typeof service[method] === 'function') originalSetters.set(field.key, service[method].bind(service));
      }
      applyPreferences();
      for (const field of preferenceFields) {
        const original = originalSetters.get(field.key);
        if (!original || field.key === 'displayOrder') continue;
        service[preferenceSetter(field.key)] = value => {
          // Native task-list controls share the plugin's preference store.
          send('MANAGER_PREFERENCES_PATCH', { patch: { [field.key]: value } }).catch(() => {});
          return original(value);
        };
      }
      service.setDisplayOrder = (value, page) => {
        const key = service.getTaskListDisplayOrderKey(page);
        send('MANAGER_PREFERENCES_PATCH', { patch: { [key]: value } }).catch(() => {});
        return originalSetters.get('displayOrder')(value, page);
      };
      service.isEnableDebugMode = () => false;
      service.setDebugMode = () => {};
      return service;
    }]);
  }]);
  const factory = ['$q', function ($q) {
    return {
      request(context) {
        const body = context.requestBody;
        return $q.when(send('RPC', { serverId: selected.id, method: body.method, params: body.params })).then(result => {
          context.connectionSuccessCallback?.({ rpcUrl: selected.url, method: 'POST' });
          context.successCallback?.(body.id, result);
        }, error => {
          context.connectionFailedCallback?.({ rpcUrl: selected.url, method: 'POST' });
          context.errorCallback?.(body.id, { message: translateText(error.message, preferences.language) });
        });
      },
      reconnect() {}, on() {},
    };
  }];
  app.factory('aria2HttpRpcService', factory);
  app.factory('aria2WebSocketRpcService', factory);
  app.run(['$rootScope', function (root) {
    root.bridgeServers = menuServers();
    root.bridgeServerId = selected.id;
    root.openBridgeSettings = () => browser.runtime.openOptionsPage();
    root.selectBridgeServer = id => send('SELECT_SERVER', { serverId: id }).then(() => location.reload());
  }]);
  const injector = angular.bootstrap(document, ['ariaNg']);
  const root = injector.get('$rootScope');
  root.setTheme(theme);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.config) { location.reload(); return; }
    if (changes.appearance) {
      theme = changes.appearance.newValue?.theme || 'system';
      root.$evalAsync(() => { settingService.setTheme(theme); root.setTheme(theme); });
    }
    if (changes.managerPreferences) {
      const next = changes.managerPreferences.newValue.options;
      const reload = ['titleRefreshInterval', 'globalStatRefreshInterval', 'downloadTaskRefreshInterval'].some(key => next[key] !== preferences[key]);
      const languageChanged = next.language !== preferences.language;
      Object.assign(preferences, next);
      if (reload) { location.reload(); return; }
      root.$evalAsync(() => {
        applyPreferences();
        root.bridgeServers = menuServers();
        if (languageChanged) injector.get('ariaNgLocalizationService').applyLanguage(preferences.language);
      });
    }
  });
}
start().catch(() => {
  const p = document.createElement('p'); p.dataset.bridgeI18n = ''; p.textContent = '后台未就绪，请重新打开 AriaNg 或在插件设置中检查配置。'; document.body.replaceChildren(p);
});
