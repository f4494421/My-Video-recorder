# 修复无法播放的录制片段

如果之前生成的部分 .webm 文件无法播放，通常是因为录制时片段在容器头或索引还未写完整时被保存/截断。最可靠的修复方法是使用 `ffmpeg` 对文件进行重封装或重编码。

步骤：

1. 安装 ffmpeg（系统需能在终端直接运行 `ffmpeg`）：

   - Windows: 访问 https://ffmpeg.org/download.html 或使用 `choco install ffmpeg` / `scoop install ffmpeg`

2. 运行仓库内的修复脚本：

```bash
node tools/fix_webm.js /path/to/broken/file_or_directory
```

脚本行为：
- 会批量查找指定路径下的 `.webm` 文件。
- 优先尝试使用 `ffmpeg -c copy` 将数据拷贝到新容器（通常能修复索引/头部问题）。
- 如果拷贝失败，会尝试重编码输出（更慢但更鲁棒）。

输出文件：
- 拷贝成功：原文件名后缀 `.fixed.webm`。
- 重编码成功：后缀 `.reencode.webm`。

注意：修复并不总能恢复所有损坏的数据，部分严重截断的文件可能无法完整恢复。建议先对文件做备份再运行脚本。
