# 紫禁天朝 · 完整皇宫 3D 项目

本项目把完整宫城的源码、依赖、测试、资源和构建产物保存在本文件夹。

## 运行

需要 Node.js 20.19+。首次安装依赖：

```sh
npm_config_cache=./.npm-cache npm ci
```

启动本地预览：

```sh
npm run dev -- --host 127.0.0.1
```

运行构建与检查：

```sh
npm run build
npm run check
```

Three.js 随项目依赖打包，场景中的宫殿、树木、城墙、河道和陈设由共享构件库程序化组装；运行时不热链模型或字体。

## 操作

- 拖动旋转，滚轮缩放，右键平移；点建筑可看介绍。
- 顶部按钮跳转整城与各宫苑，路线按钮从南门开始导览。
- 按 `F` 进入第一人称漫游，`WASD` 移动、`Shift` 加速、`Esc` 释放鼠标。
- 昼景、夕照、月夜按钮切换全局光照。左侧小地图可快速定位区域。

## 当前内容

- [实施计划](imperial-palace-plan.md)
- [风格指南](docs/STYLE_GUIDE.md)
- [整城集成检查](docs/INTEGRATION_CHECKS.md)
- [资源参考](assets/reference/palace-layout.png)
- 第三方模型与贴图：目前未接入；程序化构件不涉及外部模型许可。
