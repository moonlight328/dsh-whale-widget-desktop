# DSH 小鲸鱼余额挂件 · 独立常驻版

不依赖 DSH、单独运行的桌面常驻小鲸鱼挂件：透明无边框置顶小窗，显示 DeepSeek API 余额与**当日消耗**，打包为**单个 exe**，双击即用。

界面与交互继承 [dsh-whale-widget](https://github.com/moonlight328/dsh-whale-widget)（DSH 插件版）的视觉设计；鲸鱼气泡图为原项目（MIT）素材。

## 特性

- 🐋 透明无边框、置顶常驻小窗（默认右下角），不占任务栏
- 💰 60 秒自动刷新余额；余额变化带数字滚动动画；网络抖动沿用最近余额不报错
- 🔄 **点击切换「余额 / 当日消耗」**：当日消耗 = 当日首次读余额时的基线 − 当前余额（跨天自动重置）
- 🖱️ 拖拽移动 + 四边四分之一吸附（靠左自动镜像翻转），位置自动记忆
- 🎚️ 悬停显示大小调节按钮（0.6–1.4 倍，尺寸记忆）
- 🧸 按压 Q 弹玩偶效果
- 🖥️ 托盘图标：开机自启开关、退出
- 🔑 首次运行弹出配置卡片，粘贴 DeepSeek API Key 即可（保存于 `%APPDATA%\dsh-whale-desktop\config.json`，仅本机）

## 使用

1. 下载 Release 里的 `DSH-Whale-Widget.exe`（单文件便携版，拷到哪都能跑）
2. 双击运行，右下角出现小鲸鱼
3. 首次运行会弹出配置卡片：在 [platform.deepseek.com](https://platform.deepseek.com) 创建 API Key 并粘贴，点保存
4. 之后小鲸鱼自动常驻：拖拽移动、悬停调大小、点击切换余额/当日消耗
5. 退出或设置开机自启：右键托盘图标

## 从源码构建

需要 Node.js 20+ 与 pnpm：

```powershell
pnpm install          # 安装依赖（Electron 二进制从镜像下载）
pnpm run dist         # 打包 portable 单文件 exe → dist\DSH-Whale-Widget.exe
pnpm start            # 本地直接运行（调试）
```

国内网络可在安装/打包前设置镜像：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
```

## 目录结构

```text
whale-widget-desktop/
├── main.js              # Electron 主进程：窗口/托盘/余额拉取/当日消耗/吸附
├── preload.js           # contextBridge 隔离桥
├── renderer/
│   ├── index.html       # 透明窗口页面
│   ├── widget.js        # 挂件交互（拖拽/缩放/点击切换/动画）
│   └── assets/          # 鲸鱼气泡图
└── build/               # 打包图标等
```

## 数据与隐私

- API Key 仅保存在本机 `%APPDATA%\dsh-whale-desktop\config.json`，只用于向 `api.deepseek.com` 请求余额，绝不上传
- 当日消耗基线记录于 `%APPDATA%\dsh-whale-desktop\usage.json`

## 许可

MIT。鲸鱼素材与交互设计继承自 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（MIT）。
