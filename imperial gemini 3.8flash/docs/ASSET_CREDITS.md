# 资产来源与版权说明 (Asset Credits & Licenses)

本项目由 **Gemini 3.8 Flash Autonomous Multi-Agent Team** 独立自主全流程程序化构建完成。

---

## 一、 资产构成与零外部 3D 模型声明

- **核心 3D 网格**：全城 96 栋规制殿宇、四面高大宫墙、四角复合角楼、内金水五桥、三层汉白玉须弥座台基、九龙壁及双处重点殿堂内景（太和殿金銮宝座与坤宁宫东暖阁），**100% 采用 Three.js r186 原生数学计算与程序化几何工厂（Procedural Geometry Factory）实时生成**；
- **零外部外部模型网络请求**：无需加载任何外部 `.gltf`、`.glb` 或 `.obj` 格式文件，无需配置在线 CDN，天然具备 100% 离线运行能力与零 404 资源失效风险；
- **参考资料图**：
  - `assets/reference/palace-layout.png`：用户提供的明清皇家宫城高位斜俯视鸟瞰参考蓝图（保留原快照）。

---

## 二、 运行依赖与开源许可

| 软件/库名称 | 版本号 | 开源许可协议 | 官方主页/用途 |
| :--- | :--- | :--- | :--- |
| **Three.js** | `^0.186.1` | MIT License | 核心 3D WebGL 场景图与材质渲染引擎 |
| **Vite** | `^8.3.1` | MIT License | 极速现代前端开发服务器与生产打包构建工具 |
| **Noto Serif SC** | Google Fonts | SIL Open Font License | 中文衬线古典宋体标题排版 |
| **Cinzel** | Google Fonts | SIL Open Font License | 极简古典衬线西文字体 |

---

## 三、 本地音频合成免授权声明

项目中点击时辰切换与导览触发的清越宫廷磬钟音效，基于浏览器标准的 **Web Audio API** 原生正弦波振荡器（`AudioContext OscillatorNode`）程序化物理模拟合成，不包含任何第三方音频采样录音切片，免除一切商业版权纠纷。
