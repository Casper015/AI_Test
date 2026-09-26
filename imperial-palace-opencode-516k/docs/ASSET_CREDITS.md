# ASSET CREDITS · 第三方资源与许可清单

- 基线版本：`v0.9`（A 于 2026-09-26 首次登记）
- 结论：**v0.9 不引入任何第三方模型、贴图、字体或 HDR**；除渲染内核 three.js 外，全部构件为程序化几何与运行时 Canvas 贴图。

## 1. 第三方代码

| 资源 | 版本 | 许可 | 本地路径 | 用途 | 备注 |
| --- | --- | --- | --- | --- | --- |
| three.js | r169 | MIT | `public/vendor/three/three.module.js`（含 `addons/`） | 渲染、几何、实例化、相机控制 | 本地内置，无运行时热链；MIT 许可允许自由使用与再分发，发布包保留本说明 |

未使用任何模型加载器、压缩解码器、字体文件或环境贴图。

## 2. 程序化资源（本项目原创，无外部来源）

| 类别 | 说明 |
| --- | --- |
| 建筑构件 | `roof/hall/sideHall/pavilion/gateHall/courtyardGate/cornerTower/corridor/wall/bridge/stairs/terraceBase/railing/interior` 全部由 BufferGeometry 与 Box/Cylinder/Cone/Torus 等图元程序化生成 |
| 屋面细节 | 几何瓦垄线（沿坡向折线）、正脊脊兽组合体、攒尖宝顶、额枋下斗栱/椽头带（`src/kit/details.js`） |
| 彩画贴图 | `materials.js` 内运行时绘制的 `CanvasTexture`（青绿底 + 青蓝/白/金线，256×64）；无 `document` 环境自动退化为纯色 `caihuaGreen` |
| 铺地 | 轴线路中缝与方砖分格为几何线脚（程序化）；无外部贴图 |
| 植物/摆件 | 松、阔叶、柳（垂枝）与假山、石灯、铜香炉、旗幡、石栏、水景均为程序化几何 |
| 字体 | 页面仅使用操作系统衬线字体栈（Songti SC / STSong / Noto Serif SC 等），不携带字体文件 |

## 3. 登记与复核

- 构件与资源登记见 `src/kit/assets.js` 的 `assetRegistry`（`createKit()` 返回 `registry` 只读引用）；
  每条包含 `id / kind / builder / materials / triRange / lod / note`。
- 复核命令：`node tests/kit-a.extra.test.mjs`（校验登记字段完整性、三角面上限、mesh ≤ 16、门洞通透与无 NaN）。
- 如后续引入外部资源，必须在此登记 `sourceUrl / author / license / localPath / normalization / bounds / lod / usedBy`，
  并同步更新 `assetRegistry` 与 `docs/CONTRACTS.md` 的接口版本。
