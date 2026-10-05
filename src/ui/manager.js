import { send } from './common.js';

/* Adapter loaded after the pinned AriaNg app and before manual Angular bootstrap.
 * Native browser messages are the only RPC transport; AriaNg never gets a secret.
 */
async function start() {
  const config = await send('CONFIG_PUBLIC');
  const selected = config.servers.find(s => s.id === config.defaultServerId);
  const app = angular.module('ariaNg');
  const settingsTemplate = '<section class="content"><h2>Aria2 Bridge</h2><p>RPC 服务与下载接管配置由插件统一管理，标签页与侧栏共用。</p><button class="btn btn-primary" ng-click="openBridgeSettings()">打开设置与交接记录</button><hr><p>AriaNg 1.3.14 · 所有脚本、模板和语言资源均已内置。</p></section>';
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
      service.getDownloadTaskRefreshInterval = () => 1000;
      service.getGlobalStatRefreshInterval = () => 1000;
      service.getTitleRefreshInterval = () => 1000;
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
          context.errorCallback?.(body.id, { message: error.message });
        });
      },
      reconnect() {}, on() {},
    };
  }];
  app.factory('aria2HttpRpcService', factory);
  app.factory('aria2WebSocketRpcService', factory);
  app.run(['$rootScope', function (root) {
    root.bridgeServers = config.servers;
    root.bridgeServerId = selected.id;
    root.openBridgeSettings = () => browser.runtime.openOptionsPage();
    root.selectBridgeServer = id => send('SELECT_SERVER', { serverId: id }).then(() => location.reload());
  }]);
  angular.bootstrap(document, ['ariaNg']);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.config) location.reload();
  });
}
start().catch(() => {
  const p = document.createElement('p'); p.textContent = '后台未就绪，请重新打开 AriaNg 或在插件设置中检查配置。'; document.body.replaceChildren(p);
});
