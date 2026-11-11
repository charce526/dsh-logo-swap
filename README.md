# dsh-logo-swap

<p align="center">
  <img src="icon.png" width="96" alt="dsh-logo-swap icon">
</p>

DeepSeek Harness 品牌自定义插件。替换 DSH Web 界面中的品牌元素：侧栏 Logo、品牌字标、对话页 Logo、欢迎语标语与预览版徽章。纯前端注入实现，不修改任何安装文件，DeepSeek Harness 升级后无需重新配置。

## 功能

所有项目集中在 设置 → **Logo 自定义** 面板，各项独立配置：

| 分组 | 项目 | 说明 |
|---|---|---|
| 侧栏自定义 | Logo（左上角） | 替换品牌行图标；同时作用于标签页 favicon 与品牌行小鱼标记 |
| 侧栏自定义 | 字标（DeepSeek / Harness） | 官方字标为一张整体 SVG，本插件将其拆分为两半，各自支持 官方 / 隐藏 / 文字 / 图片 四种模式 |
| 对话页自定义 | Logo（新对话首页） | 替换对话首页的品牌图标，独立于侧栏设置 |
| 对话页自定义 | 欢迎语标语 | 将「探索未至之境」替换为任意文字 |
| 对话页自定义 | 预览版徽章 | 控制对话首页「预览版」角标的显示与隐藏 |

通用能力：

- **独立缩放**：每项提供 50%–300% 缩放滑杆。侧栏 Logo / 字标放大时自动解除品牌行容器的固定高度限制；侧栏折叠态自动跳过，不影响原有布局。
- **图片导入**：支持文件选择器或本机绝对路径两种方式，格式 png / svg / webp / jpg / gif / ico，单张不超过 4 MiB，导入后以 dataURL 形式存于 localStorage。
- **恢复默认**：每项提供独立的「恢复默认」操作；停用插件即可整体恢复官方界面。

## 安装

前提：已安装 DeepSeek Harness 桌面版；本机已安装 Git 与 Node.js ≥ 18。

插件以链接方式挂载到 DSH 的 desktop profile，安装目录需保留，不可删除。

```powershell
# 1. 克隆仓库到固定目录
git clone https://github.com/<you>/dsh-logo-swap.git D:\path\to\dsh-logo-swap

# 2. 在 desktop profile 的 package.json 中登记
#    文件位置：%USERPROFILE%\.dsh\profiles\desktop\package.json
#    ① dependencies 中新增（路径指向第 1 步目录，使用正斜杠）：
#       "dsh-logo-swap": "link:D:/path/to/dsh-logo-swap"
#    ② dsh.profile.bundles 数组中新增：
#       "dsh-logo-swap"

# 3. 建立 junction 链接，使 profile 的 node_modules 可解析到插件
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-logo-swap" `
  -Target "D:\path\to\dsh-logo-swap"

# 4. 重启 DeepSeek Harness，在 设置 → 插件 中确认 dsh-logo-swap 处于启用状态
```

无需构建步骤：宿主与前端均直接加载源码。卸载时删除上述两条登记与 junction 并重启，界面即恢复原状；localStorage 中的自定义配置不影响卸载。

## 目录结构

```
dsh-logo-swap/
├── package.json         # bundle 声明（patch 入口 + client 平台）
├── cordis.patch.yml     # bundle patch：注册 loader entry
├── icon.svg / icon.png  # 插件图标
├── lib/
│   ├── index.js         # 宿主端：logoswap 服务（本机图片读取 → dataURL）
│   ├── client.js        # 前端端：slot 注册、favicon/CSS、标语替换、设置面板
│   └── wm-paths.json    # 官方字标 SVG 拆分数据（DeepSeek / Harness 两半路径）
├── LICENSE              # MIT
└── README.md
```

## 实现说明

- 通过 `ctx.slots.inject` 进入 DSH 前端已声明的槽位（`sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.brand.mark`、`settings.section`），以 priority -1 影子注册；停用插件时 dispose，官方内容自动恢复。
- 字标的文字 / 图片模式替换 `sidebar.brand.name` 槽位；官方字标矢量数据自 BrandWordmark SVG 提取，存于 `wm-paths.json`。
- 欢迎语替换基于 TreeWalker 文本节点替换与 MutationObserver；官方 i18n 注册表为只读，无法覆盖注册。
- favicon、品牌行小鱼标记、预览版徽章的隐藏通过运行时注入 `<style>` / `<link>` 实现，随配置实时切换。
- 配置存于浏览器 localStorage（key `dsh-logo-swap.custom`），跨会话保留，旧版本格式自动迁移。

## 兼容性

- 插件依赖 DSH 前端的 slot 声明合约（`sidebar.brand.mark` 等）。这些槽位属于官方前端公开结构，版本间保持稳定；若后续大版本重构品牌行，插件需要相应适配。
- 本插件仅修改 Web 前端界面元素，不涉及桌面壳层（窗口图标、托盘图标、exe 内嵌图标）。
- 已在 Windows 桌面版验证；其余平台为纯 Web 注入，理论可用但未经测试。

## License

[MIT](LICENSE)
