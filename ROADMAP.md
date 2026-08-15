# Roadmap

## Release philosophy

**不好玩就不发布。** 天宫与地狱不以“数据存在”作为完成标准，而以真实玩家完整跑图、关卡节奏、视觉质量和逻辑一致性作为发布门槛。

## Current — 3.8.x audited baseline

- [x] 60Hz authoritative simulation
- [x] 7-player shared room
- [x] mobile physical control UI
- [x] ice-domain tangible enemy combat
- [x] pipe exit safety regression coverage
- [x] dimension gameplay retired from player-facing controls
- [x] A/B trial / promote / rollback workflow
- [x] pre-public maintenance audit

## In progress — 3.9 World Rebuild

### Celestial Realm / 天宫
- [ ] 世界从“平台串联”升级为完整垂直空间
- [ ] 云海纵深、宫阙、庭院、雷庭、凌霄殿形成视觉递进
- [ ] 每层至少一个独立核心机关，不允许纯换皮跑图
- [ ] 独立怪物生态与攻击节奏
- [ ] 小 Boss / Boss 演出与明确战斗阶段
- [ ] 隐藏路线、奖励闭环、风险与回报
- [ ] 全路线真实玩家物理跑通

### Infernal Realm / 地狱
- [ ] 连续下沉的岩层空间，不使用短坡+隐藏触发替代关卡
- [ ] 岩浆流、熔瀑、喷发、岩崩、热浪与机械骨架场景事件
- [ ] 地狱怪物独立行为与视觉轮廓
- [ ] 白骨机坊机关、王座推进与 Boss 多阶段战斗
- [ ] 危险区必须有视觉预警，视觉与伤害判定共用时钟
- [ ] 全路线真实玩家物理跑通

## Release gates

1. 真实路线无断层、空气墙、不可达触发。
2. 奖励、金币、砖块、怪物出生点通过可达性和碰撞审计。
3. 管道/区域出口安全，不允许出门即死。
4. 7 人网络与 60Hz simulation 不因新玩法明显退化。
5. Android 真机验收与自动化测试分开记录，不互相冒充。
6. 视觉上仍像占位稿时，不发布。
