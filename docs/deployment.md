# v18 部署说明

当前版本：**v18 · 2026-11-16**。版本信息见根目录 [version.json](../version.json)。

在线游戏：<https://wsluyao.github.io/social-battery-game/>

## 发布方式

仓库保持公开，GitHub Pages 从 `main` 分支的根目录发布。根目录保留 `.nojekyll`，提交后自动重新部署。项目原创内容未授予开源或其他开放使用许可，见 [版权与使用声明](../COPYRIGHT.md)。

发布前运行：

```bash
node tools/validate.mjs
```

本仓库保存当前静态发布文件，可直接托管。它不包含离线打包工具或原始开发工程，无需执行原工程的构建步骤。

## 文件与版本

- `index.html` 与 `game.html` 是同一游戏的默认入口和兼容入口，共用当前资源清单。
- `src/runtime/manifest.js` 记录运行文件、资源分组、字节大小和缓存版本 `20261116-v18`。
- `version.json`、README、两个入口的版本元信息与游戏关于页统一标为 v18。
- 当前工作树只保留有效运行资源；旧版部署说明和已替换的运行文件已移除。Git 提交历史保留供追溯。

替换资源后，应同步更新资源清单、修改过的运行文件哈希和入口缓存版本。保持 HTML、`src/`、`assets/` 的相对位置。

## 小票与分享

小票二维码和页面 canonical 地址指向上述在线游戏。微信、QQ 等分享方式根据设备能力提供系统图片分享、网页入口、保存图片或复制链接；最终发送由玩家确认。

GitHub Pages 提供静态托管，未配置微信公众号签名服务。微信内可用右上角菜单分享游戏链接，或保存小票后从相册发送。

## 本地体验

```bash
python -m http.server 8000
```

访问 [http://localhost:8000](http://localhost:8000)。存档保存在当前浏览器，换域名或端口后不会自动迁移。
