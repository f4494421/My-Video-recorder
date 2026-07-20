# My Video Recorder - Chrome 网页视频录制插件

> 当前版本：v4.3.0
> 作者：风筝@堌阳1中
> 邮箱：564913478@qq.com
> 开发时间：2026年5月

一个功能强大的 Chrome 扩展，用于录制网页中的视频内容。支持无缝分段录制、视频流自动检测、实时计时等功能。

## 主要功能

- 智能检测网页中的 video 元素
- 当前窗口多标签页选择录制目标
- 一键录制当前页
- **无缝分段录制**：每30分钟自动保存一个片段，录制不中断
- **视频流自动检测**：视频播放结束、流中断或视频元素被移除时自动保存
- **视频源切换适应**：切换线路/清晰度时自动保存当前片段并重启录制
- **页面刷新保护**：刷新或关闭页面时自动保存当前片段，防止数据丢失
- **内存优化**：分段保存防止长时间录制导致浏览器崩溃
- 实时悬浮窗，包含计时器、开始/停止按钮和关闭按钮
- Toast 通知替代弹窗，不阻塞页面交互
- 悬浮窗可拖拽移动
- 智能文件命名（网页标题+时间戳+分段号）
- 高帧率录制（30fps）
- 动态切换扩展图标（录制中/未录制）

## 使用说明

1. 打开包含视频的网页
2. 点击扩展图标，选择"录制当前标签页"或从列表中选择目标
3. 录制过程中可随时点击"停止录制"按钮，录制结束后自动保存
4. 录制超过30分钟会自动生成多个视频片段
5. 未录制状态下可点击"关闭"按钮关闭悬浮窗

## 分段录制说明

- 每段录制时长为 **30 分钟**，自动保存为独立视频文件
- 分段保存过程中**录制不中断**，实现无缝录制
- 所有文件统一命名为：`网页标题_时间戳_partNNN.webm`（从 `part001` 开始连续编号）
- 切换线路/刷新页面时自动保存当前片段并继续录制，编号**不重置**
- 手动停止时保存最后一个片段

## 项目结构

```
My Video Recorder/
├── manifest.json          # Chrome 扩展配置
├── background.js          # Service Worker（图标切换、消息通信）
├── content.js             # 内容脚本（录制核心逻辑）
├── popup.html             # 弹出窗口界面
├── popup.js               # 弹出窗口逻辑（标签页扫描）
├── generate_icons.js      # 图标生成脚本（需要 canvas 模块）
├── tools/
│   └── fix_webm.js        # 修复损坏的 .webm 文件（需要 ffmpeg）
├── icon_record_*.png      # 录制图标（16/32/48/128）
├── icon_stop_*.png        # 停止图标（16/32/48/128）
└── README.md
```

## 权限说明

- `scripting`：注入内容脚本到网页
- `activeTab`：访问当前活动标签页
- `storage`：存储扩展配置
- `host_permissions: <all_urls>`：支持在所有网站上录制视频

## 技术实现

- **MediaRecorder API**：录制视频流
- **video.captureStream(30)**：以 30fps 捕获视频元素画面
- **timeslice**：每 1 秒收集数据分片，实现无缝分段
- **stream.inactive 事件**：监听视频流中断，触发源切换流程
- **video.ended 事件**：监听视频播放结束，触发源切换流程
- **MutationObserver（DOM）**：监听视频元素被移除，触发源切换流程
- **MutationObserver（属性）**：监听视频 `src` 属性变化
- **currentSrc 轮询**：每秒检测 `video.currentSrc` 变化，覆盖不修改 `src` 属性的播放器
- **beforeunload 事件**：页面刷新/关闭前自动保存当前片段
- **状态竞态防护**：`_isRestarting` / `_isStopping` 标志防止多事件重复触发保存
- **动态图标切换**：通过 chrome.action API 切换扩展图标
- **tabs.onUpdated**：监听标签页状态，刷新时自动重置图标

## 开发工具

### 生成图标

```bash
npm run generate-icons
```

需要 `canvas` 模块。安装方法：

```bash
npm install --save-dev canvas
```

> 注意：`canvas` 是原生模块，需要 Visual Studio 2022 及 "Desktop development with C++" 工作负载。图标文件已预生成，无需重新生成即可使用扩展。

### 修复损坏的录制文件

如果生成的 `.webm` 文件无法播放，可使用修复工具：

```bash
npm run fix-webm <文件或目录路径>
```

需要系统安装 `ffmpeg`。脚本会：
1. 优先尝试直接拷贝容器头（`-c copy`）
2. 如果失败，尝试重编码（优先 libvpx/libvorbis，回退到 libx264/aac）

## 常见问题

- 页面无 video 元素无法录制
- 录制失败请检查浏览器是否支持 MediaRecorder API
- 长时间录制建议使用分段功能，避免内存溢出
- 录制的 `.webm` 文件如果无法播放，可使用 `tools/fix_webm.js` 修复

---

**注意**：请遵守相关法律法规和网站服务条款，不要录制受版权保护的内容。