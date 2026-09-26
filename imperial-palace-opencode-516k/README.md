# 紫禁天朝 · 完整皇宫 3D 项目

参照用户提供的宫城鸟瞰图，用 Three.js 制作的**等距/多角度可游览皇家宫城**：68 栋可识别建筑、18 处院落、完整宫墙与四门、四座角楼、护城河与四桥、御花园，含金銮殿与寝殿两处可进入内景。

- 规划与分工：[`imperial-palace-plan.md`](imperial-palace-plan.md)
- 多角度模式（8 视角，含第一人称）：计划 §6.4
- 风格基线：[`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md)　接口与所有权：[`docs/CONTRACTS.md`](docs/CONTRACTS.md)
- 资源与许可：[`docs/ASSET_CREDITS.md`](docs/ASSET_CREDITS.md)　各任务回执：[`docs/handoffs/`](docs/handoffs/)
- 当前状态：**可运行**（G0–G2 完成，G3 交互与 UI 已接入；G4/G5 见下方“未验证项”）

## 运行（已实测）

```bash
# 开发预览（项目根目录；无需 npm install，three.js 已内置于 public/vendor）
bash scripts/serve.sh 8123        # 然后打开 http://127.0.0.1:8123/
# 或
python3 -m http.server 8123 --bind 127.0.0.1
```

构建与测试：

```bash
node scripts/build.mjs                          # 生成 dist/（index.html + src/ + public/，相对路径）
python3 -m http.server 8124 -d dist             # 预览构建产物 http://127.0.0.1:8124/
node tests/layout.test.mjs                      # 布局：68 栋 / 18 院 / 14 连接 / 8 视角
node tests/kit.test.mjs                         # 构件库
node tests/zones.test.mjs                       # 六区契约（建筑、碰撞、机位、灯位、三角面）
node tests/fp-route.test.mjs                    # 第一人称中轴线走查（15 个路点连通）
```

截图与自动校验（不依赖人工看图）：

```bash
node scripts/shot.mjs oblique golden docs/shots/view-oblique-golden.png   # 同时写出同名 .dom.html
node scripts/shot.mjs zone golden docs/shots/zone-forecourt.png "id=zone.forecourt"
node scripts/shot.mjs fp golden docs/shots/fp-south.png "spawn=fp.boundary"
node scripts/shot.mjs oblique golden docs/shots/ui.png "ui=1"             # 带 UI 的页面快照
```

## 操作说明

| 操作 | 说明 |
| --- | --- |
| `1` 全城鸟瞰 / `2` 等距沙盘 / `3` 中轴透视 / `4` 分区视角 / `5` 建筑近景 / `6` 室内视角 / `8` 自由环绕 | 多角度模式切换（也可点左上按钮） |
| `F` | 进入 / 退出第一人称（`7` 号模式） |
| 鼠标左键拖动 / 滚轮 / 右键拖动 | 环绕旋转 / 缩放 / 平移（等距与鸟瞰） |
| 第一人称：`WASD`/方向键、`Shift`、拖动或点击锁定视角、`Esc` | 行走、加速、转视角、释放指针 |
| 点击建筑 / 双击 | 选中并查看信息 / 直接近景 |
| `M` 小地图、`T` 中轴导览、`Backspace` 取消选中 | UI 快捷操作 |

## 目录

```text
imperial-palace/
├── index.html                 # 入口（importmap 指向本地 three.js）
├── src/main.js                # 组装与唯一动画循环
├── src/core/                  # 渲染、环境、状态、注册表、相机装置、地形、区域加载
├── src/shared/                # config（色板/视角/预算）、layout（68 槽位/18 院落/连接）、rng、events
├── src/kit/                   # A：构件工厂（殿堂/宫门/亭/角楼/廊/墙/桥/台基/内景/道具）+ 资源登记
├── src/zones/                 # 六区：forecourt / inner-palace / west-courts / east-courts / garden-boundary（+ 通用构建器与灰盒兜底）
├── src/interaction/ src/ui/   # 选中与高亮、多角度切换器、小地图、建筑面板、导览、加载状态
├── public/vendor/three/       # 本地内置 three.js r169（MIT）+ OrbitControls
├── scripts/                   # serve / build / shot（自愈式截图与 DOM 快照）
├── tests/                     # 布局、构件、区域契约、第一人称路线
├── docs/                      # 风格指南、接口契约、资源许可、各任务回执、视角截图
└── dist/                      # 构建产物（相对路径，可直接 HTTP 预览）
```

## 关键约定（详见 `docs/CONTRACTS.md`）

- 单位米，Y 向上，X 向东，Z 向北；地面 `y=0`；建筑正面朝南（`-Z`）。
- 唯一相机装置 `src/core/camera.js`：八种视角共用一条平滑过渡；第一人称按可行走面取 `面高 + 1.65m`，墙体与建筑体块不可穿越。
- 区域模块统一签名 `createZone(ctx)`（花园额外 `createGarden(ctx)`），返回 `{ root, buildings, connectors, colliders, viewpoints, lightAnchors, update, dispose }`。
- 共享数值只在 `src/shared/config.js` 与 `src/shared/layout.js` 维护，区域不得自行扩张边界。

## 已知限制与未验证项

- 主场景单次渲染调用实测 `416`（含阴影通道），略高于计划初始预算 `350`；可用 `?q=medium/low` 降档，整城收口时进一步优化。
- 真机帧率、P95 帧耗时、移动端手感未实测（`scripts/shot.mjs` 使用 headless SwiftShader，数据不作为性能结论）。
- 夕照与夜景仅经统计与 DOM 校验，未做人眼比对；`docs/shots/` 内截图可作为下次比对的基线。
- 区域（B–F）与 UI（G）的分工在实施中由主 Agent 接手完成：子 Agent 两次返回空结果，仅 A（构件库与资源）按计划交付；风格精修留待后续按任务卡派回。
- 第一人称触屏仅提供点选与拖动视角，未提供虚拟摇杆。
