# 任务回执 T01 · 构件库与材质系统 (Agent A)

- **执行 Agent**：Agent A (Kit & Assets / Gemini 3.8 Flash)
- **负责文件**：`src/kit/palace-kit.js`
- **交付目标**：为所有区域施工 Agent 提供统一的明清官式建筑构件工厂、材质字典、屋顶程序化几何生成器与内景陈设构件。

---

## 交付功能清单

1. **统一材质字典 (`materials`)**：
   - 琉璃金瓦 (`roofGold`, `roofShadow`, `roofRidge`)；
   - 皇家藏书文渊黑瓦 (`roofDarkTile`)；
   - 朱砂宫墙 (`vermilion`, `wallAlt`)；
   - 汉白玉台基栏杆 (`marble`, `marbleCarved`)；
   - 殿内地坪金砖 (`goldBrick`) 与高纯度鎏金 (`gold`)；
   - 园林植物与古木树干 (`foliagePine`, `foliageCypress`, `foliageBlossom`, `trunk`)；
   - 夜景宫灯暖光材质 (`lanternGlow` 自发光)。
2. **高级屋顶程序化几何生成器**：
   - `makeHipRoofGeometry`：四面斜坡带正脊的庑殿顶与飞檐翘角；
   - `makePyramidRoofGeometry`：正四角攒尖顶；
   - `makeOctagonRoofGeometry`：八角攒尖及重檐圆亭顶；
   - `cornerTower`：三层九梁十八柱七十二条脊复合十字歇山顶。
3. **重点殿堂内景构件工厂**：
   - 太和殿金銮宝座：三层汉白玉须弥基台、七扇雕龙围屏、九龙金漆宝座、六根沥粉盘龙金柱、轩辕镜盘龙藻井与仙鹤角端香炉；
   - 坤宁宫/乾清宫寝殿内景：红木落地罩隔扇、雕花拔步大床、红木文房御案、织锦靠褥与宫灯。
4. **共享景观构件工厂**：
   - 拱券内金水五桥 (`makeBridge`)；
   - 雕花须弥座三层大台基 (`makeTerrace`)；
   - 宫墙与城垛分段墙体 (`makeWall`)；
   - 庭院地面与闭合墙门一体化工厂 (`makeCourtyard`)；
   - 古松、翠柏、垂柳、海棠多树种植物工厂 (`makeTree`)；
   - 堆秀山太湖石假山叠石工厂 (`makeRockery`)；
   - 铜狮与铜鼎香炉 (`makeBronzeStatue`)。
