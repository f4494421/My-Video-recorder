# My Video Recorder - Chrome 网页视频录制插件

> **当前版本**：v4.3.0  
> **作者**：风筝@堌阳1中  
> **邮箱**：564913478@qq.com  
> **开发时间**：2026 年 5 月～7 月

一个功能强大的 Chrome / Edge 扩展，用于录制网页中的视频内容。**支持 DRM 加密直播、HTML5 video 元素、整页录屏** 三种捕获方式，包含无缝分段录制、视频流自动检测、实时计时等完善功能。

---

## ✨ 核心亮点

| 功能 | 说明 |
|------|------|
| 🎯 **智能视频检测** | 自动遍历当前窗口所有标签页，检测含有 `<video>` 元素的页面 |
| 🔴 **普通视频录制** | 直接捕获 `<video>` 元素，30fps 高画质，文件体积小 |
| 🟧 **整页录屏（tabCapture）** | ✨ 推荐。捕获整个标签页画面+音频，DRM 加密直播专用，**无共享提示条** |
| 🟧 **屏幕分享（getDisplayMedia）** | 兜底方案。支持手动选择录制区域+分享音频 |
| ⏱️ **无缝分段录制** | 每 30 分钟自动保存一个片段，保存过程中录制不中断 |
| 💾 **自动保存保护** | 视频结束/流中断/元素移除/页面刷新/浏览器崩溃 均自动保存当前片段 |
| 🔄 **视频源切换适应** | 切换线路/清晰度时自动保存并重启录制，编号不重置 |
| 🪟 **可拖拽悬浮窗** | 实时显示录制计时、停止按钮、关闭按钮 |
| 🔔 **Toast 通知** | 无阻塞的轻量反馈，替代 alert 弹窗 |
| 📝 **智能命名** | `网页标题_时间戳_partNNN.webm`，便于回放和排序 |
| 🛡️ **防摄像头误录保护** | tabCapture 路径会检测 track label，绝不用摄像头画面替代页面内容 |

---

## 🎬 两种录制方式对比

### 方式 1：开始录制（绿色按钮）—— 捕获 video 元素

| 项目 | 说明 |
|------|------|
| **适用场景** | YouTube、B站、Vimeo、HTML5 播放器、普通视频网站 |
| **使用方式** | 浮动面板 → 点"开始录制"；或 扩展图标 → "录制视频元素" |
| **视频源** | `video.captureStream(30)` 直接抓 `<video>` 元素 |
| **是否弹授权对话框** | ❌ 无任何对话框 |
| **是否出现"共享此页面"提示条** | ❌ 不出现 |
| **画质量** | ⭐⭐⭐⭐⭐ 原画质量、文件体积最小 |
| **音频** | ✅ 自动包含 video 元素的音频 |
| **限制** | ❌ 无法录制 DRM 加密 / 自定义渲染管线 / 非标准播放器的视频 |

### 方式 2：整页录屏（橙色按钮）—— tabCapture / 屏幕分享

| 项目 | 从扩展图标触发（推荐） | 从浮动面板触发 |
|------|----------------------|----------------|
| **适用场景** | 所有 DRM 加密直播、网课（如 fengyuyun.com、钉钉直播等） | 同左，作为兜底方式 |
| **使用方式** | 🟧 扩展图标 → "整页录屏" | 🟧 浮动面板 → "整页录屏" |
| **视频源** | `chrome.tabCapture.getMediaStreamId()` + `getUserMedia({ mandatory: { chromeMediaSource: 'tab' } })` | `getDisplayMedia()`（浏览器"分享屏幕"对话框） |
| **是否弹授权对话框** | ❌ 无任何对话框 | ✅ 需手动选择"当前标签页" |
| **是否出现"共享此页面"提示条** | ❌ **不出现** | ✅ 会出现（影响观看） |
| **画面质量** | ⭐⭐⭐⭐ 高质量（接近原画） | ⭐⭐⭐⭐ 高质量（接近原画） |
| **音频捕获** | ✅ 自动包含 tab 音频（分步尝试多种配置） | ⚠️ 需勾选"同时分享音频"，否则没声音 |
| **推荐度** | ⭐⭐⭐⭐⭐ **首选** | ⭐⭐⭐ 仅当前者失败时使用 |

> 💡 **一句话建议**：打开直播页面 → 点浏览器右上角扩展图标 🎥 → 点 **橙色"整页录屏"** —— 这是最稳定且不影响观看的方式。

---

## 🚀 安装方法

### 方式 A：开发者模式加载（推荐，可自由修改代码）

1. 打开 Chrome / Edge，地址栏输入 `chrome://extensions`（Edge 用 `edge://extensions`）
2. 右上角开启"开发者模式"（Developer mode）
3. 点击左上角"加载已解压的扩展程序"（Load unpacked）
4. 选择本项目所在文件夹（`My Video recorder/`）
5. ✅ 完成。浏览器右上角会出现红色 🎥 图标

### 方式 B：通过 `.crx` 文件安装（仅 Chrome 允许）

> 本项目暂不提供 crx 打包脚本。需要时可使用 Chrome 官方 `chrome.exe --pack-extension` 命令生成。

---

## 📖 使用步骤详解

### 一、录制普通视频网站（如 B站、YouTube）

```
1. 打开视频页面，按播放键
2. 点击浏览器右上角 🎥 扩展图标
3. 在弹出窗口中：
   - 直接点 "录制视频元素" 按钮
   - 或从下方列表选择要录制的标签页
4. 页面左上角会出现浮动录制面板
5. 录制开始，面板显示计时器（如 "00:01:23"）
6. 完成后点 "停止录制"，浏览器自动下载 .webm 文件
```

### 二、录制 DRM 加密直播 / 网课（如 fengyuyun.com）

```
1. 打开直播页面，等待直播真正开始播放（有画面+有声音）
2. 点击浏览器右上角 🎥 扩展图标
3. 点击 橙色 "整页录屏" 按钮
4. ✅ 直接开始录制，无任何弹窗，无"共享此页面"提示条
5. 浮动面板计时器显示录制时间
6. 点击 "停止录制"，浏览器自动下载 .webm 文件
```

> ⚠️ **重要**：如果整页录屏失败（弹出错误提示），请：
> 1. 重新加载扩展（`chrome://extensions` → 找到本扩展 → 🔄）
> 2. 刷新直播页面
> 3. 再次从扩展图标点"整页录屏"
> 4. 若仍失败，可改用浮动面板的"整页录屏"按钮（会弹浏览器分享对话框）

### 三、录制中切换页面 / 刷新

- ✅ **刷新 / 关闭页面**：当前片段自动保存，录制停止
- ✅ **切线路 / 切清晰度**：当前片段自动保存，自动用新流继续录制，文件名编号 **不重置**
- ✅ **页面切后台**：只要标签页存在，录制继续

---

## 💾 输出格式与文件命名

### 文件格式

| 项目 | 说明 |
|------|------|
| **容器** | `WebM`（`.webm`）—— 浏览器原生支持的开放格式 |
| **视频编码** | VP9（首选）→ VP8（回退） |
| **音频编码** | Vorbis |
| **帧率** | 30 fps（video capture）/ 最高 30fps（tab capture） |
| **码率** | 由 `MediaRecorder` 自适应 |

> 在 `Windows` / `macOS` / `Linux` 上，可用 VLC、PotPlayer、MPC-HC、IINA 等播放器直接播放 `.webm`。如需转换为 MP4，可用 ffmpeg：
> ```bash
> ffmpeg -i input.webm -c copy output.mp4
> ```

### 文件命名规则

```
[网页标题]_YYYYMMDD_HHMMSS_partNNN.webm
 |           |        |        |
 |           |        |        片段序号（001 开始，不随刷新/切换重置）
 |           |        分钟:秒:时（24 小时制）
 |           年月日
 页面 <title> 标签内容（自动替换非法字符）
```

**示例**：
```
360智榜样网络安全从入门到精通_20260720_211805_part001.webm
360智榜样网络安全从入门到精通_20260720_214805_part002.webm
```

### 分段策略

- **每 30 分钟**自动保存一个片段（防止长时间录制导致内存溢出）
- 分段保存过程中**录制不中断**（无缝切换）
- 手动停止 / 页面刷新 / 流中断 等事件会**立即保存当前片段**
- 文件名中的 `partNNN` 在同一次录制会话中**持续递增**，不会因为切换流/刷新而归零

---

## 🔐 权限说明

| 权限 | 用途 |
|------|------|
| `scripting` | 向网页注入内容脚本（`content.js`），实现录制逻辑 |
| `activeTab` | 获取当前活动标签页的信息 |
| `storage` | 存储扩展内部配置和状态 |
| **`tabCapture`** | ✨ **整页录屏核心权限**。在 MV3 中通过 `getMediaStreamId()` 获取 tab 的音视频流 ID，再由 content script 用 `getUserMedia({ chromeMediaSource: 'tab' })` 消费。**不弹共享提示条的关键** |
| `downloads` | 通过 service worker 下载 tabCapture 录制的视频文件 |
| `host_permissions: <all_urls>` | 支持在任意网站上录制视频（包括 `http`、`https`、`file`） |

> **隐私说明**：所有录制数据保存在你本地电脑的浏览器下载目录，**不发送到任何服务器**。扩展不收集任何用户数据。

---

## 🛠️ 技术实现详解

### 架构概览

```
┌──────────────────────────────────────────────────────────┐
│  popup.html / popup.js         (点击扩展图标时打开的窗口)│
│   - 扫描所有标签页，检测含有 <video> 的页面               │
│   - "录制视频元素" 按钮 → 走 content.js 常规路径           │
│   - "整页录屏" 按钮 → 调 chrome.tabCapture.getMediaStreamId│
│                       → 把 streamId 交给 content.js        │
└──────────────────────┬───────────────────────────────────┘
                       │
                ┌──────▼─────────┐
                │ manifest.json   │  MV3 清单，权限声明
                └──────┬─────────┘
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼
┌────────────┐  ┌────────────┐  ┌─────────────┐
│ background │  │ content.js │  │（浏览器原生）│
│ service    │  │ 内容脚本    │  │ - MediaRecorder│
│ worker     │  │ - 查找 video│  │ - getUserMedia│
│ - 图标切换 │  │ - captureStream │ - getDisplayMedia│
│ - 消息转发 │  │ - tabCapture │  │ - beforeunload│
│ - 状态管理 │  │ - 分段保存   │  │ - MutationObserver│
└────────────┘  └────────────┘  └─────────────┘
```

### 核心流程

#### ① 普通视频录制（video.captureStream 路径）

```
popup.js 发消息 "start_record_on_tab"
    ↓
background.js 注入 content.js 到目标 tab
    ↓
content.js.showRecordingFloat() 显示浮动面板
    ↓
用户点 "开始录制"
    ↓
content.js:
  1. findVideoElement() 遍历 DOM（含 Shadow DOM）找 <video>
  2. _captureStreamWithRetry() 以 500ms 间隔最多重试 8 秒
  3. createRecorder(): new MediaRecorder(stream, timeslice=1000)
  4. 注册监听器：stream.inactive / video.ended / DOM MutationObserver / currentSrc 轮询
  5. beforeunload 事件保存当前片段
```

#### ② 整页录屏（tabCapture 路径，推荐）

```
popup.js recordWholePageBtn 点击
    ↓
chrome.tabCapture.getMediaStreamId({ consumerTabId, targetTabId })
    ↓ 拿到 streamId（只有 popup 有扩展用户手势上下文，才能拿到）
    ↓
chrome.scripting.executeScript → 调用 content.js.startTabCaptureRecording(streamId)
    ↓
content.js:
  1. getUserMedia({ video:{ mandatory:{ chromeMediaSource:'tab', chromeMediaSourceId } }, audio:{...} })
  2. ✅ 安全检查：video track label 含 "camera" 等字样立即丢弃（防止录到摄像头）
  3. 同 content.js 共用 MediaRecorder + 分段保存逻辑
```

> **关键技术细节**：`chromeMediaSource: 'tab'` **必须放在 `mandatory` 对象内**（Chrome 兼容要求）。放在顶层会被忽略，`getUserMedia` 会回退到默认设备——**会录到摄像头**！这是最容易踩的坑。

#### ③ 屏幕分享（getDisplayMedia 兜底路径）

```
content.js 检测到 tabCapture 失败（从浮动面板触发无扩展手势）
    ↓
getDisplayMedia({ video:{ displaySurface:'browser' }, audio:true, preferCurrentTab:true, systemAudio:'include' })
    ↓
浏览器弹出"分享屏幕"对话框（用户需选择"当前标签页"+ 勾选"同时分享音频"）
    ↓
同共享 MediaRecorder 逻辑
```

### 分段录制实现机制

```
                     ┌─────────────┐
 MediaRecorder       │ chunks 数组  │  timeslice=1000ms，每秒推一帧
 timeslice=1000ms ─▶ └──────┬──────┘
                            │
  ┌────────────每 30 分钟 ─────────────┐
  │                                         │
  ▼                                         ▼
requestSegmentSave(false)            用户点"停止录制"
  │                                         │
  ├─ recorder.stop() 触发 dataavailable     │
  ├─ Blob([...chunks]) → 自动下载 .webm     │
  ├─ segmentIndex++                         │
  ├─ lastSegmentTime = now                  │
  └─ createRecorder() 继续录制 ↺            │
                                            ▼
                                      requestSegmentSave(true)
                                          │
                                          ├─ recorder.stop()
                                          ├─ Blob → .webm
                                          └─ 清理所有资源
```

### 视频源变化检测矩阵

| 触发事件 | 检测方式 | 处理 |
|----------|---------|------|
| 视频正常播放完毕 | `video.onended` | 保存片段 + 尝试寻找新 video |
| MediaStream 中断（如网络断开） | `stream.oninactive` | 保存片段 + 重试最多 8 秒 |
| `<video>` 元素被 DOM 移除 | `MutationObserver` 监听 subtree | 保存片段 + 寻找新 video |
| `<video.src>` 属性变化 | `MutationObserver.attributes` | 保存片段 + 重新 captureStream |
| 播放器修改 internal source | `setInterval` 每秒对比 `currentSrc` | 保存片段 + 重新 captureStream |
| 页面刷新 / 关闭 | `window.beforeunload` | 保存最后片段（**同步 Blob 下载**） |

### 防止竞态的关键设计

```javascript
this._isRestarting = false;  // 正在切换视频源时，屏蔽其他事件触发重复保存
this._isStopping = false;    // 正在停止时，屏蔽 restart / beforeunload 重复保存
this._restartDeadline = Date.now() + 8000;  // 8 秒内拿不到新流视为永久失败
```

---

## 🧭 故障排查

### ❓ 问题 1：录制的视频是黑的 / 只有音频没有画面

**原因**：视频源使用了 **DRM（数字版权管理）加密**或自定义渲染管线，`video.captureStream()` 拿不到画面。

**解决**：改用 **整页录屏**。从扩展图标点橙色"整页录屏"按钮。

---

### ❓ 问题 2：录制到了摄像头画面，而不是网页视频

**原因**：`chromeMediaSource: 'tab'` 格式错误，被 Chrome 忽略，`getUserMedia` 回退到了默认摄像头设备。

**解决**：
1. ✅ 已在 v4.3.0 修复：tabCapture 路径强制使用 `mandatory` 包裹格式
2. ✅ 已添加 label 安全检查：`/camera|cam|webcam/i.test(track.label)` 为真时立即停止并报错
3. 如果仍发生，**从扩展图标**点"整页录屏"（不要从浮动面板点）

---

### ❓ 问题 3：录制的视频没有声音

**原因和解决**：

| 路径 | 可能原因 | 修复 |
|------|---------|------|
| **整页录屏（tabCapture）** | 直播页面暂未播放音频 | 等直播/视频真正播放出声音后再点录制 |
| **整页录屏（tabCapture）** | Chrome 限制了页面音频捕获 | 控制台查看 `[tabCapture] audio 方案 N 失败` 日志；可改用屏幕分享路径 |
| **屏幕分享（getDisplayMedia）** | 分享对话框未勾选"同时分享音频" | 下次重新录制时在浏览器弹窗中勾选"同时分享音频" / "分享标签页音频" |
| **普通 video 录制** | `video.captureStream()` 未返回音频轨道 | 先确认视频本身在静音后正常播放声音；再试试整页录屏 |

**诊断**：打开浏览器开发者工具（F12 → Console），搜索 `[录制诊断]`，会看到类似：
```
[录制诊断] 视频轨=1, 音频轨=0    ← 没拿到音频
  video track: label="", ...
  ← (无 audio track 日志)
```

---

### ❓ 问题 4：屏幕分享时出现蓝色"正在与 xxx.com 共享此标签页"提示条，遮挡视频

**原因**：使用 `getDisplayMedia()` 的必然结果——Chrome 强制提示用户页面正在被分享。

**解决**：改用 **tabCapture 路径**（从扩展图标点橙色"整页录屏"）。tabCapture 是 Chrome 扩展的专用 API，**不触发浏览器分享提示条**，不会影响观看。

---

### ❓ 问题 5：录制的 .webm 文件无法播放

**原因**：录制意外中断（浏览器崩溃 / 断电 / 网络异常），`.webm` 文件头不完整。

**解决**：

```bash
# 方法 A：用 ffmpeg 重新封装（最快，无画质损失）
ffmpeg -i damaged.webm -c copy fixed.mp4

# 方法 B：重编码（较慢，但成功率高）
ffmpeg -i damaged.webm -c:v libx264 -c:a aac fixed.mp4
```

> 项目中 `FIX_RECORDED_VIDEOS.md` 文件包含更详细的修复说明。

---

### ❓ 问题 6：点击扩展图标后，浮动面板未出现

**排查**：

1. 确认已在 `chrome://extensions` 开启本扩展
2. 确认当前页面不是 `chrome://` / `edge://` / `about:blank` 等 Chrome 内部页面（扩展无法注入）
3. 按 F12 → Console，检查是否有 `Unchecked runtime.lastError` 错误
4. 刷新当前页面，重试
5. 在 `chrome://extensions` → 找到本扩展 → 点 🔄 "重新加载"，再重试

---

### ❓ 问题 7：整页录屏报错"tabCapture 录制失败：请重新加载扩展"

**原因**：Chrome 安全策略——`tabCapture.getMediaStreamId()` 需要**扩展用户手势上下文**才能工作。从浮动面板（注入到页面中的 JS）触发时没有这个上下文。

**解决**：**从扩展图标 popup 中点"整页录屏"**（而不是从页面浮动面板点）。popup 窗口本身属于扩展，自带扩展手势上下文。

---

## 📂 项目结构

```
My Video recorder/
├── manifest.json          # MV3 扩展清单（权限、脚本映射、图标）
├── background.js          # Service Worker（图标切换、消息路由、tabCapture 流 ID 获取）
├── content.js             # 内容脚本（录制核心，≈900 行，含 MediaRecorder 封装）
├── popup.html             # 扩展图标弹窗 HTML
├── popup.js               # 弹窗逻辑（标签页扫描、录制触发、整页录屏入口）
├── generate_icons.js      # 脚本：用 canvas 模块生成各尺寸图标
├── svg2png.js             # 脚本：SVG → PNG 辅助工具
├── icon_record_16.png     # 录制图标（16×16）
├── icon_record_32.png     # 录制图标（32×32）
├── icon_record_48.png     # 录制图标（48×48）
├── icon_record_128.png    # 录制图标（128×128）
├── icon_stop_16.png       # 停止图标（16×16）
├── icon_stop_32.png       # 停止图标（32×32）
├── icon_stop_48.png       # 停止图标（48×48）
├── icon_stop_128.png      # 停止图标（128×128）
├── package.json           # npm 脚本定义（generate-icons / fix-webm）
├── FIX_RECORDED_VIDEOS.md # 损坏视频的修复指南
├── update-guide.html      # 更新说明页面（部分浏览器安装用）
├── LICENSE                # MIT 开源协议
├── .gitignore             # Git 忽略规则
└── README.md              # 本文件
```

---

## 📦 开发工具与脚本

### 生成图标（首次开发时用）

```bash
npm install
npm run generate-icons
```

> 需要 Node.js `canvas` 模块，它是原生模块，需要系统有 C++ 编译器（Windows 需要 Visual Studio Build Tools + "Desktop development with C++" 工作负载）。**图标文件已预生成在项目中**，用户无需运行此脚本即可使用扩展。

### 修复损坏的 WebM 文件

```bash
npm run fix-webm path/to/damaged.webm      # 修复单个文件
npm run fix-webm path/to/folder             # 批量修复文件夹内所有 .webm
```

需要系统已安装 `ffmpeg` 并在 PATH 中。脚本逻辑：
1. 优先尝试直接拷贝流（`-c copy`，无重编码，秒级完成）
2. 失败则尝试 VP9/Vorbis 重编码
3. 最后回退到 H.264/AAC 重编码

---

## 🌐 浏览器兼容性

| 浏览器 | 最低版本 | 支持程度 |
|--------|---------|---------|
| **Google Chrome** | 110+ | ⭐⭐⭐⭐⭐ 完美 |
| **Microsoft Edge** | 110+ | ⭐⭐⭐⭐⭐ 完美 |
| **Brave** | 最新 | ⭐⭐⭐⭐ 基本完美（部分 Shield 设置需调整） |
| **Opera** | 最新 | ⭐⭐⭐ 可用（使用 Chromium 内核） |
| **Firefox** | — | ❌ 不支持（使用 Firefox 自身 API，但本扩展的 tabCapture 是 Chrome 专有 API） |
| **Safari** | — | ❌ 不支持 |

---

## 🆚 与在线录屏工具对比

| 特性 | My Video Recorder | 在线录屏网站 | 桌面录屏软件（OBS 等） |
|------|------------------|------------|----------------------|
| 安装方式 | Chrome 扩展加载，1 分钟完成 | 无需安装 | 下载安装包，5~30 分钟 |
| DRM 加密直播录制 | ✅ tabCapture 支持 | ❌ 通常不支持 | ✅ 但需手动选窗口 |
| 文件体积 | 小（仅编码视频区域） | 中 | 大（整屏 + 音频） |
| 系统资源占用 | 低（浏览器进程内） | 中 | 高（独立进程） |
| 分段自动保存 | ✅ 30 分钟分段 + 事件触发 | ❌ 无 | ⚠️ 需手动配置 |
| 崩溃保护 | ✅ beforeunload 自动保存 | ❌ 崩溃即丢失 | ⚠️ 部分支持 |
| 弹出式"共享提示条" | ✅ tabCapture 路径无 | ❌ 必有 | ❌ 必有（录制区域高亮） |
| 是否上传到云端 | ❌ 纯本地保存 | ⚠️ 可能上传（隐私风险） | ❌ 纯本地 |
| 录制摄像头保护 | ✅ label 安全检查 | ❌ 无 | ❌ 需手动选源 |

---

## ⚖️ 法律与版权声明

请遵守相关法律法规和网站服务条款：

1. ✅ 仅录制你**有权录制**的内容（如你自己的视频、公开课演示、公共直播回放等）
2. ❌ 不要录制受版权保护的商业视频（如付费电影、VIP 电视剧）
3. ❌ 不要录制隐私会议 / 他人私密内容
4. ❌ 不要用于商业转售 / 传播 / 盈利目的
5. ✅ 合理使用原则（Fair Use / 合理使用）在你所在法域可能适用，请自行判断

**本扩展的作者不对用户的使用行为承担任何法律责任。**

---

## 📬 问题反馈

如遇到 bug 或有功能建议：
- **邮箱**：564913478@qq.com
- 请附上：浏览器版本、出问题的页面 URL、控制台（F12）中 `[tabCapture]` / `[录制诊断]` 等相关日志

---

## 📜 版本历史

### v4.3.0（2026-07-20）✨ 最新
- ✅ **新增 tabCapture 整页录屏**（支持 DRM 加密直播）
- ✅ **新增屏幕分享兜底路径**（getDisplayMedia，用于 tabCapture 不可用的场景）
- ✅ **mandatory 约束修复**：修复 `chromeMediaSource: 'tab'` 顶层格式导致回退到摄像头的严重 bug
- ✅ **新增 track label 安全检查**：防止误录摄像头
- ✅ **音频分步获取策略**：tab capture 音频失败时尝试多种配置，最后回退到系统麦克风
- ✅ **getDisplayMedia 多配置尝试**：`preferCurrentTab` + `systemAudio` + 基础配置三级下降
- ✅ **popup 路径不会回退到 getDisplayMedia**：避免出现影响观看的共享提示条
- ✅ **增强的控制台诊断日志**：`[tabCapture]` / `[录制诊断]` 前缀便于排查问题
- ✅ 新增权限：`tabCapture`、`downloads`

### v4.2.0（2026-06-xx）
- 增强 MutationObserver 检测范围
- 优化分段保存的文件命名逻辑
- 修复 Shadow DOM 中 video 元素找不到的问题

### v4.1.0（2026-06-xx）
- 新增 Toast 通知替代 alert
- 浮动面板支持拖拽移动
- 修复视频源切换后录制中断的问题

### v4.0.0（2026-05-xx）
- 初始发布
- 核心功能：video 元素捕获、分段录制、自动保存

---

## 📖 参考资料

- [Chrome Extensions - Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [MediaRecorder API](https://developer.mozilla.org/zh-CN/docs/Web/API/MediaRecorder)
- [tabCapture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [getDisplayMedia API](https://developer.mozilla.org/zh-CN/docs/Web/API/MediaDevices/getDisplayMedia)
- [WebM 容器格式](https://www.webmproject.org/)

---

> **Made with ❤️ by 风筝@堌阳1中** — 一个为自己解决痛点，也希望能帮到你的小工具。