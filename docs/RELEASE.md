# 签名包准备与发布

稳定 Firefox 附加组件 ID：`aria2-bridge@hsopex.github.io`。仅支持桌面 Firefox 140+。发布版本需保持 package.json 与 manifest.json 版本一致。

1. 使用锁文件冻结安装，执行 `pnpm lint`、`pnpm test`、`pnpm build`，完成 `docs/VALIDATION.md` 中适用验收。
2. 在 `dist/` 目录执行 `sha256sum -c SHA256SUMS` 校验未签名 ZIP；检查打包文件不包含 node_modules、测试配置、任何真实 Secret 或用户下载数据。
3. 保留源代码、pnpm-lock.yaml、固定 AriaNg 原始资源、provenance、许可证和构建补丁供 AMO 源码审查。用 `git archive` 导出版本源码。
4. 提供 Mozilla/AMO 的签名凭据后，按所选渠道签名，例如在本机执行：

   ```sh
   pnpm exec web-ext sign --source-dir build/extension --artifacts-dir dist/signed --channel unlisted
   ```

   `web-ext` 可从 `WEB_EXT_API_KEY`、`WEB_EXT_API_SECRET` 环境变量读取凭据，不将凭据提交到仓库。签名需要外部账号和 Mozilla 审核，仓库不内置凭据。
5. 验证签名 XPI 的版本、ID、安装权限与数据声明，再分发。商店上架另行处理；本项目没有自动商店发布步骤。

AriaNg 依赖旧 AngularJS 和部分旧 UI 库。保留上游许可证，CSP 禁止 eval 和可执行内联脚本。已记录的第三方 DOM 写入扫描告警不等于 Mozilla 已批准；最终签名审查需提供适配说明。不要修改权限声明为“none”来绕过数据说明。
