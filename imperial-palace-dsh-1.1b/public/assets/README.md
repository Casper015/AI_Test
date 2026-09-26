# public/assets/ — 有意为空

本项目**全部构件与贴图程序化生成**（`src/kit/`），不使用任何第三方模型/贴图/HDR/字体，
因此本目录不含任何运行时资源文件。

- 资源来源与许可登记：见 `docs/ASSET_CREDITS.md`（结论段：无第三方素材）。
- 若后续任务引入真实素材：先在 `docs/ASSET_CREDITS.md` §2 登记（9 字段），
  并按 `config.ASSETS` 的规范（米 / Y 向上 / 地面中心 pivot / srgb / GLB 优先）在 `work/` 统一加工后落入本目录；
  运行时经 `ctx.assets`（`src/kit/assets.js`）加载，同一份资源只保留一份。

子目录 `models/`、`textures/`、`environments/`、`fonts/` 为预留位置，当前均为空。
