# 部署与更新

在线地址：<https://wsluyao.github.io/social-battery-game/>

## GitHub Pages

1. 将网站文件放在仓库根目录，保留 `index.html`、`game.html`、`src/` 和 `assets/` 的相对位置。
2. 在仓库 **Settings → Pages** 中选择 **Deploy from a branch**。
3. 发布分支选择 **main**，目录选择 **/(root)**，保存。
4. 保留根目录的 `.nojekyll`，让发布过程直接使用已经准备好的静态文件。

以后向 `main` 提交更新，Pages 会重新发布。设置方法可参阅 [GitHub 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 更新内容

先在本地运行 `node tools/validate.mjs`，再提交并推送。资源清单记录了运行文件的地址和字节大小；替换资源时需要同步更新 `src/runtime/manifest.js`，并更新入口文件的资源版本号。

本次发布相对 v17 原包的调整：

- 新增中英文 README、项目封面、游戏截图与静态验证。
- 新增 GitHub Pages 发布标记和入口描述信息。
- 将充电小票二维码与页面 canonical 地址设置为本仓库的在线游戏地址。
- 更新修改后的运行文件名称、资源大小和版本号。

`部署说明_v17.md` 保留了原包的更新记录。其中提到的离线构建工具属于原开发工程，不包含在此发布仓库中。

## 更换域名或部署路径

页面运行时的资源路径是相对路径，可以部署在子目录。迁移时需要同步修改两个 HTML 入口的 canonical 地址，以及运行包中的 `SHARE_GAME_QR` 内容并重新生成二维码矩阵。修改运行包后，需同步更新资源清单中的名称与大小。

浏览器存档按网站来源隔离。换域名、端口或设备后，原存档不会自动迁移。
