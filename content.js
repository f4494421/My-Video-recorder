// 防止重复注入
if (!window.__segmentRecorderInjected) {
    window.__segmentRecorderInjected = true;

    // 分段录制管理器
    class SegmentRecorder {
        constructor() {
            this.segments = [];           // 存储所有片段
            this.currentSegment = 0;      // 当前片段编号
            this.recordingStartTime = 0;  // 总录制开始时间
            this.segmentDuration = 30 * 60 * 1000; // 30分钟一段 1000毫秒
            this.isRecording = false;
            this.recorder = null;
            this.stream = null;
            this.video = null;
            this.infoTimer = null;        // 信息更新定时器
            this.autoSave = true; // 自动保存状态，默认开启
        }

        async startRecording() {
            try {
                this.video = document.querySelector('video');
                if (!this.video) {
                    alert('未找到视频元素');
                    return;
                }

                this.stream = this.video.captureStream(30);
                this.recordingStartTime = Date.now();
                this.isRecording = true;

                // 通知 background.js 分段录制已开始
                chrome.runtime.sendMessage({ type: 'segment_recording_started' });

                // 开始第一段录制
                await this.startSegment();

                // 设置自动分段定时器
                this.segmentTimer = setInterval(() => this.autoSegment(), this.segmentDuration);

                // 显示分段录制悬浮窗
                this.showSegmentFloat();

            } catch (error) {
                alert('启动分段录制失败：' + error.message);
            }
        }

        async startSegment() {
            try {
                this.recorder = new MediaRecorder(this.stream, {
                    mimeType: 'video/webm;codecs=vp9',
                    videoBitsPerSecond: 3_000_000 // 降低码率以节省内存
                });

                const chunks = [];

                this.recorder.ondataavailable = e => chunks.push(e.data);

                this.recorder.onstop = async () => {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    this.segments.push(blob);

                    // 保存当前片段
                    await this.saveSegment(blob, this.currentSegment);

                    // 如果不是手动停止，继续下一段
                    if (this.isRecording) {
                        this.currentSegment++;
                        await this.startSegment();
                    }
                };

                this.recorder.start();
                console.log(`开始录制第 ${this.currentSegment + 1} 段`);

            } catch (error) {
                console.error('启动片段录制失败：', error);
                this.handleError(error);
            }
        }

        async autoSegment() {
            if (this.recorder && this.recorder.state === 'recording') {
                console.log(`自动分段：第 ${this.currentSegment + 1} 段完成`);
                this.recorder.stop();
            }
        }

        async saveSegment(blob, segmentIndex) {
            if (!this.autoSave) {
                alert('未自动保存视频片段！');
                return;
            }
            try {
                const url = URL.createObjectURL(blob);
                let title = document.title || 'recorded';
                if (title.length > 20) title = title.slice(0, 20) + '...';
                title = title.replace(/[\\/:*?"<>|]/g, '_');

                const now = new Date();
                const pad = n => n.toString().padStart(2, '0');
                const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

                const a = document.createElement('a');
                a.href = url;
                a.download = `${title}_第${segmentIndex + 1}段_${timestamp}.webm`;
                a.click();

                setTimeout(() => URL.revokeObjectURL(url), 10000);

                // 更新悬浮窗显示
                this.updateFloatInfo();

            } catch (error) {
                console.error('保存片段失败：', error);
            }
        }

        async stopRecording() {
            this.isRecording = false;

            if (this.segmentTimer) {
                clearInterval(this.segmentTimer);
            }

            if (this.recorder && this.recorder.state === 'recording') {
                this.recorder.stop();
            }

            // 通知 background.js 分段录制已停止
            chrome.runtime.sendMessage({ type: 'segment_recording_stopped' });

            // 修复：停止后移除悬浮窗
            this.removeSegmentFloat();
        }

        showSegmentFloat() {
            // 创建分段录制专用悬浮窗
            const float = document.createElement('div');
            float.id = 'segment-recorder-float';
            float.style.position = 'fixed';
            float.style.top = '30px';
            float.style.right = '30px';
            float.style.zIndex = '999999';
            float.style.background = 'rgba(30,30,30,0.95)';
            float.style.color = '#fff';
            float.style.padding = '16px 24px';
            float.style.borderRadius = '12px';
            float.style.boxShadow = '0 4px 24px rgba(0,0,0,0.2)';
            float.style.fontSize = '14px';
            float.style.minWidth = '280px';
            float.style.cursor = 'move';

            float.innerHTML = `
                <div style="margin-bottom:8px;font-weight:bold;color:#4CAF50;display:flex;align-items:center;">
                    <span>● 分段录制中</span>
                    <label style="margin-left:16px;font-weight:normal;font-size:13px;display:flex;align-items:center;">
                        <input type="checkbox" id="autoSaveCheckbox" ${this.autoSave ? 'checked' : ''} style="margin-right:4px;">自动保存
                    </label>
                </div>
                <div id="segment-info" style="margin-bottom:8px;">
                    <span>当前片段：第 <span id="current-segment">1</span> 段</span>
                    <span>已保存：<span id="saved-segments">0</span> 个片段</span>
                    <span>总时长：<span id="total-time">00:00:00</span></span>
                </div>
                <button id="stop-segment-btn" style="background:#e53935;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">停止录制</button>
            `;

            document.body.appendChild(float);

            // 停止按钮事件
            document.getElementById('stop-segment-btn').onclick = () => {
                this.stopRecording();
            };

            // 自动保存复选框事件
            const autoSaveCheckbox = document.getElementById('autoSaveCheckbox');
            if (autoSaveCheckbox) {
                autoSaveCheckbox.checked = this.autoSave;
                autoSaveCheckbox.onchange = () => {
                    this.autoSave = autoSaveCheckbox.checked;
                };
            }

            // 拖动功能
            let isDragging = false;
            let offsetX = 0, offsetY = 0;
            float.addEventListener('mousedown', function (e) {
                if (e.target.id === 'stop-segment-btn') return;
                isDragging = true;
                offsetX = e.clientX - float.getBoundingClientRect().left;
                offsetY = e.clientY - float.getBoundingClientRect().top;
                document.body.style.userSelect = 'none';
            });
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            function onMouseMove(e) {
                if (!isDragging) return;
                float.style.left = (e.clientX - offsetX) + 'px';
                float.style.top = (e.clientY - offsetY) + 'px';
                float.style.right = '';
            }
            function onMouseUp() {
                isDragging = false;
                document.body.style.userSelect = '';
            }

            // 启动信息更新定时器
            this.infoTimer = setInterval(() => this.updateFloatInfo(), 1000); // 每秒更新一次

            // 更新悬浮窗信息
            this.updateFloatInfo();
        }

        updateFloatInfo() {
            const currentSegmentEl = document.getElementById('current-segment');
            const savedSegmentsEl = document.getElementById('saved-segments');
            const totalTimeEl = document.getElementById('total-time');

            if (currentSegmentEl) currentSegmentEl.textContent = this.currentSegment + 1;
            if (savedSegmentsEl) savedSegmentsEl.textContent = this.segments.length;

            // 计算总时长
            if (totalTimeEl && this.recordingStartTime) {
                const totalSeconds = Math.floor((Date.now() - this.recordingStartTime) / 1000);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const seconds = totalSeconds % 60;
                totalTimeEl.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }

        removeSegmentFloat() {
            const float = document.getElementById('segment-recorder-float');
            if (float) float.remove();

            // 清除信息更新定时器
            if (this.infoTimer) {
                clearInterval(this.infoTimer);
                this.infoTimer = null;
            }
        }

        cleanup() {
            this.segments = [];
            this.currentSegment = 0;
            this.recordingStartTime = 0;
            this.isRecording = false;
            this.recorder = null;
            this.stream = null;
            this.video = null;

            // 清除定时器
            if (this.infoTimer) {
                clearInterval(this.infoTimer);
                this.infoTimer = null;
            }
        }

        handleError(error) {
            console.error('分段录制错误：', error);
            alert('录制过程中发生错误：' + error.message);
            this.stopRecording();
        }
    }

    // 创建全局分段录制实例
    window.segmentRecorder = new SegmentRecorder();

    // 开始分段录制
    window.startSegmentRecording = () => {
        window.segmentRecorder.startRecording();
    };

    // 停止分段录制
    window.stopSegmentRecording = () => {
        window.segmentRecorder.stopRecording();
    };
}
