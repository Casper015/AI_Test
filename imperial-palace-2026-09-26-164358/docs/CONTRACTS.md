# 模块接口 v1

主 Agent 冻结共享接口。每个区域 Agent 开工前阅读本文件和 `STYLE_GUIDE.md`，只改任务卡授权的区域文件。

```js
export function createZone(ctx) {
  return {
    root,             // Three.Group；区域几何用世界坐标创建，root 保持单位变换
    buildings,        // { id, name, category, description, access, x, z, size:[w,d], visitable, group }
    courtyards,       // { id, name, bounds:[minX,maxX,minZ,maxZ], center:[x,z] }
    connectors,       // { id, position:[x,y,z], width, targetZone }
    colliders,        // world-space {type:'wall', xMin, xMax, halfThickness, center:[x,z], rotation} segments
    update(dt, time, state), // 可选；dt 与 time 均为秒
    dispose()
  };
}
```

区域模块可以由动态 `import()` 异步加载；`createZone(ctx)` 本身当前同步返回场景记录。`ctx = { THREE, kit, config, layout, zoneKey, zoneLayout }`。`kit` API:

- `makeBuilding({ id, name, kind, x, z, width, depth, height, tiers, openFront, ornament, roofType, colorVariant, access, description })` 返回 `{ group, record }`。
- `addBuilding(zone, spec)` 将构件加入区域 `root` 并把 record 放入 `buildings`。
- `makeCourtyard(zone, { id, name, x, z, width, depth, gate, wallHeight, paving })` 注册庭院，并生成地坪与围合边界。
- `makeWall({ start:[x,z], end:[x,z], height, thickness, gateWidth })` 返回带分段 collider 数据的墙组；`makeCourtyard` 会自动登记墙体碰撞。`makeTree({x,z,scale,kind})`、`makeLamp({x,z})`。

建筑点击拾取由 kit 在可见 mesh 的 `userData.buildingId` 写入稳定 ID。区 ID 前缀固定为 `forecourt`、`inner`、`west`、`east`、`garden`。同一连接点只由契约中指定区域创建一次。区域 update 接收统一秒数；仅 `main.js` 启动一个 RAF。
