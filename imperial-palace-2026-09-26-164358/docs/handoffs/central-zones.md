# B/C · 中轴前朝与三进内廷交付回执

## 基线与文件归属

- 已读 `imperial-palace-plan.md` 全文、用户参考图、`STYLE_GUIDE.md`、`CONTRACTS.md`、共享 `config.js`/`layout.js`、现有 kit 与原 B/C 交接。主 Agent 确认后按风格/接口 **v1** 开工。
- 仅改 `src/zones/forecourt.js`、`src/zones/inner-palace.js` 和本回执；kit、共享文件、入口、UI 与其它区域只读。
- B 边界 `X [-100,100] / Z [-398,83]`，C 边界 `X [-100,100] / Z [83,302]`；两区均以米制世界坐标放置，`root` 保持单位变换。B 不创建南城门/外墙，C 负责内廷门。

## 契约与连接

- 同步 `createZone(ctx)` 消费 `THREE / kit / layout`；返回 `root, buildings, courtyards, connectors, colliders, update, dispose`。内廷现在直接登记各庭院墙体 collider，主 Agent 遍历时不会重复。
- B 原样登记 `forecourt-south`、`west-south`、`east-south`；C 原样登记 `axial-inner`、`inner-garden`、`west-north`、`east-north`。连接 ID、宽度、标高与位置均未改。kit 的材质/墙/树/灯/建筑 API 不变。
- B 保持 **19 栋/8 院**、`forecourt-` 建筑 ID；C 保持 **18 栋/3 院**、`inner-` 建筑 ID。两座可入内建筑各附 `interiorView`：太和殿 `[0,6.79,-84]` 指向 `[0,8.54,-63]`；寝殿 `[0,3.57,175.5]` 指向 `[0,4.52,187.1]`。这只是机位元数据，接入行为归主 Agent。

## 本次完成

- 前朝主殿台基加入两侧南北梯道、丹陛中心通路、南北栏杆对应三处开口；侧沿可绕过主殿，后段又绕过中和、保和两座不可入内殿堂，重接 `axial-inner`。把原先无效的 `mats.warmGold` 改为 kit 的 `mats.gold`。
- 金銮殿保留 kit 的真实南面门洞与台基，补室内金砖、成排朱柱与四根盘龙纹柱、层叠藻井、宝座屏风与香炉。中央入口至宝座前留净空；室内拾取网格仍标记同一建筑 ID。
- 近景复测反馈后，两处内景补齐 kit 原本只有横梁的后墙。太和殿后墙两翼通高，屏风后的中央保留窄门及门楣，让北阶仍可经殿内绕达；寝殿补完整后墙、彩画顶棚与后墙侧屏，南入口和院外绕行线未遮挡。
- 内廷三进院落以东西窄步道绕过实体殿堂，南北各自回到中轴门；后寝亭移至侧院，避免堵住第三进主线。南内廷门由 `z=94` 微调至 `z=97`，使其台阶落在后宫边界内；四个连接点未移动。
- 内廷门改用 kit `openFront` 实体门洞，补北向落阶，摆脱查找/隐藏 kit 合批子网格的耦合。紫宸寝殿同样用 kit 开敞壳体，南面另设真实门洞与窗格、床榻帷幔、寝具屏风、侧几；中央可进入。仅局部补件采用 kit 已有材质。
- 自建静态砖石、台阶、内景饰件按材质在所属 group 内合批，不合并跨建筑 ID；区域释放自有几何/非共享灯材质，不销毁共享 kit 材质。

## 实际验证与限制

- `node --check src/zones/forecourt.js`、`node --check src/zones/inner-palace.js` 和 `npm run check` 通过；整城检查为 **88 栋、20 院、11 个唯一连接**。主 Agent 新增的批处理检查亦通过：静态网格 **1372 → 116**、20 个批次、88 栋仍可拾取。
- Three.js 实例化统计：B 为 **19 栋/8 院/3 连接/20 墙 collider、323 个 Mesh、约 29,740 三角**；C 为 **18 栋/3 院/4 连接/24 墙 collider、253 个 Mesh、约 17,068 三角**。这些是模块遍历计数，不是浏览器 Draw Call；阴影与后处理成本未包含。
- 两处后墙用室内朝北的射线抽查：太和殿两翼和高处中轴均命中 `taihe-interior-wall`；寝殿侧部及中轴均命中 `inner-bedchamber-interior-wall`，命中网格的 `buildingId` 分别保持原 ID。太和殿低处中轴由原宝座/屏风遮挡，中央后门仍留通路。
- 按登记建筑 footprint 与墙 collider 抽查 B 的 17 个、C 的 21 个路径节点，均无阻挡命中；实际连续人物体积、爬阶阈值、内景穿越、从南桥贯通御苑还需由主 Agent 的漫游高度/碰撞实现和浏览器实走验收。
- 本区域未改全局相机/漫游。**尚未验证**固定 1440×900 的昼夕夜截图、真实设备 FPS/P95、整帧 Draw Call、构建产物与浏览器首屏；请在整城集成检查中记录。区域 Mesh 数仍高于初始 70/50 绘制预算，需以主场景实际调用判断，必要时继续由主 Agent/kit 统筹优化。
