# Komari-Theme-LuminaUltra

一直以来，比较支持这样一个观点：**如果有比较特殊的需求，并且自己具备相关能力，最好可以进行二次开发** 原因主要有几点：
1. 需考虑大方向设计维护。毕竟公用产品，但每个兄弟的审美、习惯和需求都有所不同，“众口难调”，自己喜欢的才是最好的。
2. 能力、精力有限。 我是后端开发，前端也仅是通过Vibe Coding完成。如果兄弟具备前端开发能力，最好是再开发。
3. 版本存在滞后性。 有问题或者好建议我会记录并后续版本中处理。但现实本职+生活影响，时间并非充裕。
产品最初的价值和目标，是希望兄弟们用得、看得、体验舒服。所以，无论是建议、功能优化、交互逻辑、设计思路，还是发现 Bug，都非常欢迎积极、开放地提交 Issue。

基于 [shanyang242/Komari-Theme-LuminaPlus](https://github.com/shanyang242/Komari-Theme-LuminaPlus) 二次开发并更名为 LuminaUltra；其上游基于 [komari-theme-Lumina](https://github.com/stqfdyr/komari-theme-Lumina)。感谢 [shanyang242](https://github.com/shanyang242) 和原作者 [stqfdyr](https://github.com/stqfdyr) 开源相关主题。

## 当前版本

LuminaUltra **v1.7.0** 新增 V4/V6 标签显示开关，以及按服务器批量配置三网探测点的功能。批量设置支持多选节点，并可分别保留线路 1、2、3 中无需更改的线路。基于已同步的 [LuminaPlus v1.3.2](https://github.com/shanyang242/Komari-Theme-LuminaPlus/releases/tag/v1.3.2)，完整变更见 [v1.7.0 更新说明](.github/release-notes/v1.7.0.md)。

## 效果预览

<p align="center">
  <img src="docs/images/theme-preview.png" alt="Komari-Theme-LuminaUltra 综合预览" width="90%">
</p>

### 首页总览与节点卡片

首页总览新增文字评级，节点卡片同步优化流量额度、在线时长与布局密度；支持背景图、桌面视频与卡片透明度调节。

<p align="center">
  <img src="docs/images/v1.1.9/overview-large-card-solid.png" alt="首页总览与大卡片" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.9/overview-large-card-solid-dark.png" alt="首页总览与大卡片夜间模式" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.9/overview-compact-card-solid.png" alt="首页总览与小卡片" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.9/overview-compact-card-solid-dark.png" alt="首页总览与小卡片夜间模式" width="70%">
</p>

### 透明背景

背景图、桌面视频与卡片透明度可在主题管理中配置，支持大卡片、小卡片和移动端布局。

<p align="center">
  <img src="docs/images/v1.1.9/overview-large-card-glass.png" alt="透明背景首页总览与大卡片" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.9/overview-large-card-glass-dark.png" alt="透明背景首页总览与大卡片夜间模式" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.9/overview-compact-card-glass.png" alt="透明背景首页总览与小卡片" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.9/overview-compact-card-glass-dark.png" alt="透明背景首页总览与小卡片夜间模式" width="70%">
</p>

### 视频背景

桌面端可在主题管理中将背景类型切换为“视频”。主题内置一个静音 H.264 测试视频，默认站内路径为：

```text
/assets/LanternRivers_1080p15fps2Mbps3s.mp4
```

需要使用自己的视频时，推荐使用 MP4（H.264、无音轨、短循环）或浏览器兼容的 WebM。

#### VPS 上传自定义视频

Komari 常见安装目录下，主题视频所在位置为：

```text
/komari/data/theme/LuminaUltra/dist/assets
```

自定义视频的文件名不要与内置测试视频相同，否则主题可能仍会加载默认视频。下面以 `my-background.mp4` 为例。

1. 先把视频上传到 `/komari` 作为长期备份。以下命令在本地电脑执行，请将 `VPS_IP` 换成服务器地址：

   ```bash
   scp ./background.mp4 root@VPS_IP:/komari/my-background.mp4
   ```

2. 登录 VPS，将备份视频复制到主题资源目录：

   ```bash
   ssh root@VPS_IP
   cp -f /komari/my-background.mp4 /komari/data/theme/LuminaUltra/dist/assets/my-background.mp4
   chmod 644 /komari/data/theme/LuminaUltra/dist/assets/my-background.mp4
   ```

3. 在主题管理中启用自定义背景并选择“视频”，将视频地址改为：

   ```text
   /assets/my-background.mp4
   ```

4. 保存设置后刷新浏览器。

> 更新或重新安装主题后会恢复为默认视频。请务必在 `/komari` 保留一份自定义视频备份；更新后重新执行下面两条命令将视频拷回，再在主题管理中选择 `/assets/my-background.mp4` 即可恢复：

```bash
cp -f /komari/my-background.mp4 /komari/data/theme/LuminaUltra/dist/assets/my-background.mp4
chmod 644 /komari/data/theme/LuminaUltra/dist/assets/my-background.mp4
```

#### 自行构建主题

将文件以独立名称放入 `public/assets/`，例如 `public/assets/my-background.mp4`，然后在主题管理中填写 `/assets/my-background.mp4`。不要与内置测试视频同名。

执行 `npm run build` 时，Vite 会把 `public/assets/` 原样复制到 `dist/assets/`；执行 `npm run package` 时，打包脚本会把整个 `dist/` 收入主题 ZIP，因此内置视频和自行放入的资源都会随发布包打包。

视频仅在宽屏、非触摸主设备且用户未启用“减少动态效果”或省流量模式时加载；其他情况继续使用已配置的背景图。

### 实例详情

实例详情页优化 Ping 与负载图表展示，支持断点连线、手动刷新和更稳定的图表尺寸。

Ping 图表可切换“延迟 / 丢包率”。丢包率按原始样本数量加权计算，支持后端聚合数据和旧版 Ping 记录；“削峰平滑”仅用于延迟视图。

<p align="center">
  <img src="docs/images/v1.1.9/instance-ping.png" alt="实例详情 Ping 图表" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.9/instance-ping-dark.png" alt="实例详情 Ping 图表夜间模式" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.9/instance-load.png" alt="实例详情负载图表" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.9/instance-load-dark.png" alt="实例详情负载图表夜间模式" width="70%">
</p>

### 移动端

移动端总览卡片采用更紧凑的信息展示，保留评级和关键指标。

<p align="center">
  <img src="docs/images/v1.1.9/mobile-overview-solid.png" alt="移动端总览与小卡片" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.9/mobile-overview-solid-dark.png" alt="移动端总览与小卡片夜间模式" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.9/mobile-overview-glass.png" alt="移动端透明背景总览与小卡片" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.9/mobile-overview-glass-dark.png" alt="移动端透明背景总览与小卡片夜间模式" width="70%">
</p>

### 资产统计

资产统计界面重做，整合入口、指标、明细排序与汇率信息。

在主题管理的“服务器花费”中，可通过“向访客开放资产统计”控制未登录访客的访问：

- 默认开启，兼容原有站点行为。
- 关闭后，访客看不到卡片内入口、顶部快捷入口及临期提醒中的资产详情入口；直接打开 `/assets` 会返回首页。登录后，按入口开关显示。
- “显示资产页入口按钮”控制资产概览卡内的入口；“显示资产快捷入口”控制首页右上角箭头展开后的资产按钮，与主题设置相邻。两个入口独立控制，可以同时显示；都关闭时，资产页对所有用户关闭。
- 原“显示资产悬浮按钮”设置沿用保存字段 `showCostSummaryFloatingButton`，升级后自动用于顶部快捷入口，无需重新设置。手机端不再显示独立的底部资产按钮；顶部快捷栏保持单行，按实际按钮数量调整间距与尺寸，极窄宽度下可横向滑动操作按钮。
- 此开关控制主题入口和资产页；首页资产概览的金额、节点卡片中的价格，仍由各自显示开关控制。

<p align="center">
  <img src="docs/images/v1.1.7/asset-summary.png" alt="资产统计" width="70%">
</p>

### 首页排序

原有默认、名称、实时网速、累计流量和价格排序继续保留，新增：

| 排序方式 | 初次选择时的顺序 | 再次点击同一选项 |
| --- | --- | --- |
| 离线 | 离线节点在前，在线节点在后；各组内按后端权重排列 | 切换为在线优先 |
| 高负载 | 在线节点按 CPU 使用率从高到低排列 | 切换为从低到高 |

高负载排序随实时数据更新，离线节点始终放在该排序末尾；在线状态未知或无效读数不参与负载比较。相同读数按后端权重与节点标识稳定排序。其他排序方式仍保持离线节点后置。

主题管理的“默认排序维度”与“默认方向”可设置站点初始顺序。访客临时切换时沿用现有的页面会话偏好，并与分组、地区筛选共同生效。

### 访客信息卡片

参考 [komari-theme-emerald](https://github.com/Tokinx/komari-theme-emerald) 的访客卡片，在首页、节点详情、资产页和流量页底部显示当前访问者的信息，沿用 LuminaUltra 的浅色、深色和卡片背景设置。

- 默认开启。管理员登录后，打开首页右上角“主题设置”，在“首页巡检 → 显示访客信息卡片”中开启或关闭，并点击“保存设置”；也可直接访问 `/?view=theme-manage`。主题管理页本身不显示卡片。
- 桌面端折叠时显示来源、遮盖最后一段的 IPv4 和浏览器，例如 `1.1.1.1` 显示为 `1.1.1.*`；IPv6 遮盖后半段。手机端折叠时显示来源文字，并保留 IP 和浏览器图标。
- 手机端卡片在底部可用区域居中，展开后与桌面端一样采用两列、三行信息布局；长 IP、运营商名称和访问时间按列宽换行。
- 香港、台湾、澳门的位置文字分别统一为 `China Hongkong`、`China Taiwan`、`China Macau`。三个网络信息来源共用规则，兼容中英文名称和缺失地区代码；其他位置在国家与城市名称相同时只显示一次。
- 使用 Emerald 同款 Tabler 图标：来源定位、桌面设备、Socket.IO、浏览器、楼宇与时钟。有有效国家代码时显示主题内置国旗；代码缺失或图片加载失败时回退为定位图标。图标随主题打包。
- 首次查询及失败后重试使用圆角短条骨架占位，不显示加载文字；有缓存数据时继续展示原有信息。占位颜色随浅色、深色主题变化。
- 点击整张卡片展开为紧凑信息网格，显示来源、设备、完整 IP、浏览器、运营商和本次页面访问时间。再次点击任意信息区域、点击卡片外部或按 Esc 收起，支持 Enter 和空格操作；卡片不再显示“访客”标记及展开、收起提示文字。
- 展开与收起均使用 240 毫秒线性宽高过渡，旧内容先淡出，新内容随后淡入；连续点击可平滑反向切换。浏览器启用“减少动态效果”时直接切换，不播放动画。
- 鼠标和触屏点击不显示焦点边框；键盘操作保留中性灰色焦点提示。
- 卡片背景共用“背景与透明度 → 卡片不透明度”设置，启用自定义背景后与节点卡片同步变化。
- 网络信息依次尝试 `ip.sb`、`ipwho.is`、`ipapi.is`，每个来源最多等待 4 秒；成功后不再请求后续来源，同一页面会话内复用 10 分钟内的结果。
- 网络查询失败不影响设备和浏览器信息，展开后可重新获取。关闭卡片会停止进行中的查询，关闭期间不发起新查询。

### 主题管理

主题管理新增总览评级配置，并加入小卡片在线时间、资产统计等显示项开关。

当前版本还支持：

- 在“卡片显示项”中分别控制小卡片的到期时间和节点卡片底部的续费价格（例如 `¥7/月`）；价格开关同步作用于大卡片、小卡片、迷你卡片和列表视图，资产统计页仍保留完整费用明细。
- 在“卡片显示项 → 跨视图设置”中关闭“显示 V4/V6 标签”，即可统一隐藏大卡片、小卡片和迷你卡片上的 V4/V6 标签，随后点击“保存设置”。默认开启，升级后沿用原有显示效果。
- 在“首页总览”中分别控制在线节点、实时带宽、累计流量、资产概览、内存信息和硬盘信息卡片；开关全部启用时六张卡片保持在同一行，窄屏可横向滚动查看。资源卡片显示所有可见节点的已用量、总量和使用率。
- 在“03 背景”中开启“背景动效”，可选择樱花飘落、细雨、缓雪、秋叶飘落、庆典彩纸或烟花。动效默认关闭，可与背景图、背景视频独立设置；浏览器启用“减少动态效果”或省流量模式时不播放。

#### 批量配置服务器探测点

1. 管理员打开首页右上角“主题设置”（也可访问 `/?view=theme-manage`），在“主页延迟检测”中开启三网模式，并选齐三项全局默认任务。
2. 点击“配置服务器探测点”，切换到“批量设置”。勾选需要修改的服务器，或通过搜索、分组和配置状态筛选后点击“全选筛选结果”。跨筛选保留已选节点，可用“清空选择”重新选择。
3. 分别设置“线路 1”“线路 2”“线路 3”的探测点。每项默认为“不更改”，保留每台所选服务器当前对应线路的值；原先继承全局的节点以当前全局三条线路为基础建立单独配置。手机端勾选后点击“设置所选服务器线路”。
4. 点击“应用到所选服务器”，检查结果后点击“保存设置”。“重置线路选择”仅清空尚未应用的批量选择，不会撤销已应用到主题草稿中的修改。

例如只修改线路 2 时，线路 1 和线路 3 都保留“不更改”，即可保留各节点原有的这两条线路。没有选中的节点保持原配置。

每台服务器的三条线路必须使用不同探测点。如果批量选择与某台服务器保留的线路重复，面板会提示冲突并阻止整批应用，不会自动交换其他线路。探测点未在 Komari 后台绑定到节点时，会沿用现有的未绑定提示和模拟数据设置；真实探测任务的绑定仍在 Komari 后台管理。

<p align="center">
  <img src="docs/images/v1.1.7/settings-overview.png" alt="总览评级配置" width="70%">
</p>

<p align="center">
  <img src="docs/images/v1.1.7/settings-card-cost.png" alt="小卡片与资产统计配置" width="70%">
</p>

### 离线状态

离线节点保持清晰的状态提示，同时保留最近一次上报的关键指标。

<p align="center">
  <img src="docs/images/v1.1.7/offline-card.png" alt="离线节点状态" width="70%">
</p>

## 致谢

特别感谢 [stqfdyr/komari-theme-Lumina](https://github.com/stqfdyr/komari-theme-Lumina)。

特别感谢 [Montia37/komari-theme-purcarte](https://github.com/Montia37/komari-theme-purcarte) 提供视频背景的设计思路与内置测试视频素材。

感谢 [Tokinx/komari-theme-emerald](https://github.com/Tokinx/komari-theme-emerald) 提供访客信息卡片的交互、图标搭配与信息来源参考，相关图标来自 MIT 许可的 [Tabler Icons](https://github.com/tabler/tabler-icons)。

也感谢 Komari 官方主题、Mochi 等主题项目为 Komari 生态提供的设计和实现思路。

## 参考

- [Komari](https://github.com/komari-monitor/komari)
- [komari-theme-Lumina](https://github.com/stqfdyr/komari-theme-Lumina)
- [komari-theme-purcarte](https://github.com/Montia37/komari-theme-purcarte)
- [Komari 主题开发文档](https://komari-document.pages.dev/)

## 本地 UI 审查

无需连接 Komari 后端也可以检查完整数据界面：

```bash
npm run dev -- --host 0.0.0.0
```

打开开发地址并追加 `?mock=1`。该模式只在 Vite 开发环境启用，会提供正常、高负载、临期、离线、多地区与多币种节点，以及固定的访客网络信息；生产构建不会包含这份测试数据。使用 `?mock=1&admin=1&view=theme-manage` 可检查主题管理与保存行为，模拟设置仅在当前页面内保留。去掉查询参数即可恢复真实接口。

## Star History

<a href="https://www.star-history.com/?repos=P0me1oo%2FKomari-Theme-LuminaUltra&type=timeline&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=P0me1oo/Komari-Theme-LuminaUltra&type=timeline&theme=dark&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=P0me1oo/Komari-Theme-LuminaUltra&type=timeline&legend=bottom-right" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=P0me1oo/Komari-Theme-LuminaUltra&type=timeline&legend=bottom-right" />
 </picture>
</a>
