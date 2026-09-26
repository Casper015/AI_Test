# 紫禁天朝 · 资源与许可登记（ASSET_CREDITS）

本项目除下列依赖与用户提供的参考图外，**不下载、不内嵌任何第三方模型、贴图、字体或 HDR 资源**；全部建筑、构件、材质贴图与 UI 元素均为程序化生成（Three.js 几何 + Canvas 贴图），随源码交付。

## 1. 运行时依赖（本地内置，非热链）

| id | sourceUrl | author | license | localPath | normalization | bounds | lod | usedBy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| three.js r169 | https://github.com/mrdoob/three.js (unpkg `three@0.169.0`) | three.js authors | MIT | `public/vendor/three/three.module.js` | 原样，未改动 | — | 主库 | 全项目渲染 |
| OrbitControls | unpkg `three@0.169.0/examples/jsm/controls/OrbitControls.js` | three.js authors | MIT | `public/vendor/three/addons/controls/OrbitControls.js` | 原样 | — | — | 相机装置（oblique/iso/axis/zone/focus/interior/orbit） |
| BufferGeometryUtils | unpkg `three@0.169.0/examples/jsm/utils/BufferGeometryUtils.js` | three.js authors | MIT | `public/vendor/three/addons/utils/BufferGeometryUtils.js` | 原样 | — | — | 构件合并（`merge()`） |
| EffectComposer / RenderPass / UnrealBloomPass / OutputPass / ShaderPass / MaskPass / Pass | unpkg `three@0.169.0/examples/jsm/postprocessing/*` | three.js authors | MIT | `public/vendor/three/addons/postprocessing/*` | 原样 | — | — | 金瓦高光与夜景 Bloom |
| CopyShader / LuminosityHighPassShader / OutputShader | unpkg `three@0.169.0/examples/jsm/shaders/*` | three.js authors | MIT | `public/vendor/three/addons/shaders/*` | 原样 | — | — | 上列后处理依赖 |

许可文本：`public/vendor/three/three.module.js` 文件头保留 `Copyright 2010-2024 Three.js Authors / SPDX-License-Identifier: MIT`；MIT 许可允许本项目使用与再分发，交付时请保留该文件头。

## 2. 参考素材（非运行时资源）

| id | sourceUrl | author | license | localPath | normalization | bounds | lod | usedBy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| palace-layout.png | 用户提供（AI_Test 项目内） | 用户 | 用户自持，仅本项目参考用 | `assets/reference/palace-layout.png` | 未改动 | 632×316 | — | 布局与视觉层级参考（不参与渲染，不进入 `dist/` 运行时依赖） |

## 3. 程序化材质清单（本项目自产，无外部来源）

| 材质 | 生成方式 | 尺寸 | usedBy |
| --- | --- | --- | --- |
| 琉璃瓦 `tile` | Canvas：竖瓦垄 + 斑驳 | 256² | 全部屋面（`roofGold`/`roofDeep`） |
| 宫墙 `wall` | Canvas：朱红粉墙斑驳 | 128² | 墙身、院墙 |
| 汉白玉 `marble` | Canvas：石纹与分缝 | 256² | 台基、栏杆、桥、华表 |
| 铺地 `paving` | Canvas：6 m 一格砖纹 | 256² | 广场、道路、院面 |
| 砾石 `gravel` | Canvas：园路 | 128² | 御花园步道 |
| 青绿彩画 `painting` / 斗栱 `bracket` | Canvas：箍头、旋子、斗栱点金 | 256×64 / 128×64 | 额枋与斗栱带 |
| 门扇 `door` / 菱花 `lattice` | Canvas：门钉与棂花 | 128×256 / 128² | 殿门、窗、廊 |
| 金砖 `brick` | Canvas：细缝金砖 | 128² | 殿内与寝殿地面 |
| 水面法线 `waterN` | Canvas：噪声法线 | 128² | 护城河、太液池、园池 |

## 4. 许可与合规说明

- 项目源码（`src/`、`scripts/`、`tests/`、`index.html`、文档）由本项目作者编写，可按项目约定分发。
- 全部宫殿名为展示设定，用于本项目交互与说明，不作为史实考据断言。
- 交付包中第三方内容仅 three.js 及其官方 addons（MIT）；如需二次分发，请保留 `public/vendor/three/**` 内的版权与许可声明。
- 未使用任何需要署名的外部模型、贴图、HDR 或字体；系统字体（Songti SC / PingFang SC 等）由访问者操作系统提供，不随项目分发。
