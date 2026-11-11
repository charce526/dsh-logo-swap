# dsh-logo-swap

<p align="center">
  <img src="icon.png" width="96" alt="dsh-logo-swap icon">
</p>

DeepSeek Harness 品牌自定义插件 —— 把界面各处的 DeepSeek 品牌元素换成你自己的，纯前端注入，不改任何安装文件，DSH 升级不受影响。

## 功能一览

设置 → **Logo 自定义**，五大项全部独立设置，每项支持显示/隐藏、换图、缩放（50%–300%）：

| 分组 | 项目 | 说明 |
|---|---|---|
| 侧栏自定义 | Logo（左上角/侧栏） | 替换品牌行小鱼图标；同时驱动标签页 favicon 与品牌行小鱼（不随大小缩放） |
| 侧栏自定义 | 字标（DeepSeek + Harness） | 官方艺术字标拆成两半，各自可选 官方 / 隐藏 / 文字 / 图片 |
| 对话页自定义 | Logo（新对话首页） | 替换首页大 Logo，独立于侧栏设置 |
| 对话页自定义 | 欢迎语标语 | 替换「探索未至之境」为任意文字 |
| 对话页自定义 | 预览版徽章 | 一键隐藏/显示「预览版」角标 |

- **独立缩放**：每项单独 50%–300% 滑杆；侧栏 Logo/字标放大时自动解锁品牌行的固定高度框（折叠态自动跳过，不破坏布局）
- **图片导入**：文件选择器或本机绝对路径（≤4 MiB，png/svg/webp/jpg/gif/ico），自动转为 dataURL 存 localStorage
- **一键恢复**：单项「恢复默认」按钮；停用插件 = 全部恢复官方原状

## 安装

前提：已安装 DeepSeek Harness（desktop 版），本机装有 Node.js ≥18。

```powershell
# 1. 克隆到任意固定目录（插件以链接方式挂载，目录不能删）
git clone https://github.com/<you>/dsh-logo-swap.git D:\path\to\dsh-logo-swap

# 2. 在 DSH 的 desktop profile 里登记（两条记录）
#    文件: %USERPROFILE%\.dsh\profiles\desktop\package.json
#    ① dependencies 加一条（路径指向第 1 步的目录，正斜杠）
#       "dsh-logo-swap": "link:D:/path/to/dsh-logo-swap"
#    ② dsh.profile.bundles 数组加一项
#       "dsh-logo-swap"

# 3. 建链接（让 profile 的 node_modules 能解析到包）
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-logo-swap" `
  -Target "D:\path\to\dsh-logo-swap"

# 4. 重启 DeepSeek Harness，在 设置 → 插件 里确认 dsh-logo-swap 已启用
```

无需构建步骤：host 与前端都直接读源码（bundle patch + client bundle）。卸载 = 删除上面两条登记与 junction，重启后界面恢复原状；浏览器 localStorage 里的自定义配置可留可清。

## 结构

```
dsh-logo-swap/
├── package.json         # bundle 声明（patch + client web）
├── cordis.patch.yml     # bundle patch：insert 一条 loader entry
├── icon.svg / icon.png  # 插件图标
├── lib/
│   ├── index.js         # host 半端：logoswap/read 服务（本机路径读图 → dataURL）
│   ├── client.js        # 前端半端：slot 注册、favicon/CSS、标语替换、设置面板
│   └── wm-paths.json    # 官方字标 SVG 拆分数据（DeepSeek/Harness 两半路径）
├── LICENSE              # MIT
└── README.md
```

## 技术要点

- 通过 `ctx.slots.inject` 进入官方声明的槽位（`sidebar.brand.mark` / `sidebar.brand.name` / `conversation.hero.brand.mark` / `settings.section`），priority -1 影子注册，停用时 dispose 即恢复官方
- 字标文字/图片模式直接替换 `sidebar.brand.name` 槽位；官方艺术字数据从 BrandWordmark SVG 提取（`wm-paths.json`）
- 标语替换走 TreeWalker 文本节点替换 + MutationObserver（官方 i18n 为只读，不可覆盖注册）
- favicon / 品牌行小鱼 CSS / 预览版徽章隐藏 均为运行时 `<style>`/`<link>` 注入，随状态实时切换
- 状态存浏览器 localStorage（key `dsh-logo-swap.custom`），跨刷新保留；旧版格式自动迁移

## 兼容性说明

- 插件依赖 DSH 前端的 slot 声明（`sidebar.brand.mark` 等），这些是官方前端合约，版本间相对稳定；但 DSH 大版本更新后若官方前端重构了品牌行，可能需要适配
- 仅改 Web 前端界面元素；DSH 桌面壳（窗口图标、托盘图标、exe 内嵌图标）不在此插件范围内
- 已在 Windows 桌面版验证；其他平台理论可用（纯 Web 注入），未测试

## License

[MIT](LICENSE)
