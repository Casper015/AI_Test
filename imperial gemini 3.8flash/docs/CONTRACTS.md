# 紫禁天朝 · 架构设计与契约规范 (Architecture & Contracts v1.0)

本项目严格执行“主 Agent 架构统筹 + 7 大子 Agent 专职分工”的研发体系，所有区域与交互模块通过标准接口进行解耦。

---

## 一、 区域工厂接口定义

所有区域（前朝、后宫、西宫苑、东宫苑、御花园与边界）通过统一的 `createZone(ctx)` 工厂函数向主场景暴露场景数据：

```javascript
/**
 * @param {Object} ctx
 * @param {typeof THREE} ctx.THREE - Three.js 核心库实例
 * @param {Object} ctx.kit - 共享建筑构件库 (PalaceKit) 实例
 * @param {Object} ctx.config - 全局冻结配置 (CONFIG)
 * @param {Object} ctx.layout - 共享布局与连接契约 (BOUNDS, CONNECTORS, ZONES)
 * @param {string} ctx.zoneKey - 区域主键标识
 * @param {Object} ctx.zoneLayout - 区域坐标范围与权属分配
 * @returns {ZoneRecord}
 */
export function createZone(ctx) {
  return {
    root,        // THREE.Group：包含该区域所有实体几何，坐标直接使用世界坐标，root 保持单位矩阵
    buildings,   // Array<BuildingRecord>：本区所辖所有建筑的标准注册信息
    courtyards,  // Array<CourtyardRecord>：本区所辖庭院的边界与中心定义
    connectors,  // Array<ConnectorRecord>：本区独占负责的跨区连接通道定义
    colliders,   // Array<ColliderRecord>：供第一人称漫游与碰撞检测计算的物理段
    update,      // (dt, elapsed, state) => void 可选帧更新回调
    dispose      // () => void 区域自有资源析构释放
  };
}
```

---

## 二、 数据实体契约规范

### 1. 建筑注册实体 (`BuildingRecord`)
```javascript
{
  id: 'fc-taihe-dian',          // 全局唯一且具有区域前缀的稳定标识符
  name: '太和殿（金銮宝殿）',     // 展示用中文字符串
  kind: 'hall',                // 建筑类型：'hall' | 'gate' | 'sideHall' | 'pavilion' | 'cornerTower' | 'corridor'
  category: '东方三大殿之首',    // 规制分类标签
  x: 0,                        // 世界坐标 X (米)
  z: -65,                      // 世界坐标 Z (米)
  size: [65, 37],              // 建筑面阔与进深 [width, depth]
  height: 24,                  // 建筑总高度 (米)
  tiers: 2,                    // 重檐层数 (1 或 2)
  roofType: 'wudian',          // 屋顶形式：'wudian' | 'xieshan' | 'pyramid' | 'circle' | 'cornerTower' | 'blackTile'
  access: '可进入',             // 访问等级：'可进入' | '外观可览' | '可通行'
  visitable: true,             // 布尔值，是否支持第一人称或镜头进入内景
  description: '...'           // 详实的历史考据与功用解说文本
}
```

### 2. 庭院注册实体 (`CourtyardRecord`)
```javascript
{
  id: 'fc-taihe-court',
  name: '太和殿万国来朝礼仪广场',
  bounds: [-98, 98, -265, -85], // [minX, maxX, minZ, maxZ] 闭合矩形
  center: [0, -175]            // 庭院中心 [x, z]
}
```

### 3. 连接通道契约 (`ConnectorRecord`)
每个连接通道在全局仅由一个指定的 Zone 负责实例化，禁止跨区重复构建：
- `forecourt-south`、`west-south`、`east-south`：由 **Zone B（前朝）** 独占所有；
- `axial-inner`、`west-north`、`east-north`：由 **Zone C（后宫）** 独占所有；
- `gate-south`、`gate-north`、`gate-west`、`gate-east`、`inner-garden`：由 **Zone F（御花园与边界）** 独占所有。

### 4. 碰撞体契约 (`ColliderRecord`)
```javascript
{
  type: 'wall',
  start: [x1, z1],
  end: [x2, z2],
  thickness: 2.1
}
```

---

## 三、 单一职责与渲染管线约定

1. **唯一动画循环**：全工程只在 `src/main.js` 中开启唯一 `requestAnimationFrame` 驱动主循环，严格杜绝各子组件或区域内私自创建 RAF；
2. **唯一相机与控制器**：所有八视角跳转、中轴导览、建筑聚焦及第一人称漫游，均由统一的 `CameraController` 与 `FirstPersonController` 驱动；
3. **有限值保证**：通过 `scripts/check.mjs` 静态断言，整城 100% 顶点的 X、Y、Z 坐标必须为有限数值，严禁任何计算溢出产生的 `NaN` 或 `Infinity`。
