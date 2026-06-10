# 坦克对决 / Tank Duel

一个轻量级浏览器坦克射击游戏。玩家驾驶坦克在迷宫或开放竞技场中与 AI 敌人对战，支持炮弹反弹、小地图、计分板、战斗参数设置和简单的智能体接口。

## 启动方式

最简单方式：

1. 双击 `StartGame.bat`
2. 或直接打开 `index.html`

也可以使用本地服务器：

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

然后打开：

```text
http://127.0.0.1:4173/
```

## 操作方式

- `W / S`：前进 / 后退
- `A / D`：车体左转 / 右转
- 鼠标移动：控制炮塔方向
- 鼠标左键：射击
- `Space / Enter`：射击
- `Esc`：释放鼠标锁定

回合结束后：

- `Enter / R`：再来一局
- `Esc / M`：回到设置

## 游戏功能

- 第三人称坦克射击
- 鼠标独立控制炮塔
- 键盘控制车体移动和转向
- 迷宫地图或开放竞技场
- 小 / 中 / 大地图选择
- 炮弹反弹
- 自伤和友伤
- 出生无敌时间
- 小地图
- 击杀 / 死亡 / 助攻计分板
- 开火、命中、反弹、撞击的图像和音效反馈

## 战斗参数

在主菜单点击“战斗参数”可以设置：

- 坦克血量
- 玩家速度
- 车体转向速度
- 敌人速度
- 炮弹伤害
- 炮弹速度
- 射击间隔
- 炮弹存在时间
- 出生无敌时间

设置会在下一局开始时生效。

## 地图设置

主菜单可设置：

- 地图大小：小 / 中 / 大
- 是否生成迷宫

关闭“生成迷宫”后，会生成开放竞技场，只保留边界和少量掩体。

## 项目结构

```text
.
├── index.html          # 游戏入口页面
├── StartGame.bat       # Windows 一键启动入口
├── Basic.md            # 初始设计文档
├── README.md           # 项目说明
└── src
    ├── main.js         # 游戏主逻辑
    ├── config.js       # 游戏配置
    ├── lang.js         # 中文 UI 文案
    ├── three-lite.js   # 轻量渲染兼容层
    ├── agent-api.js    # AI / 强化学习接口
    └── styles.css      # 页面样式
```

## AI / 强化学习接口

游戏实例挂在：

```js
window.__tankGame
```

获取当前观测：

```js
window.__tankGame.agentBridge.getObservation()
```

接管敌人控制：

```js
window.__tankGame.agentBridge.setController("enemy", (obs, dt) => ({
  move: [1, 0, 0],
  fire: true
}));
```

取消接管：

```js
window.__tankGame.agentBridge.clearController("enemy");
```

## 名称

- 中文名：坦克对决
- English name: Tank Duel
