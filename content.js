<<<<<<< HEAD
// 分段录制管理器
class SegmentRecorder {
    constructor() {
        this.segments = [];           // 存储所有片段
        this.currentSegment = 0;      // 当前片段编号
        this.recordingStartTime = 0;  // 总录制开始时间
        this.segmentDuration = 30 * 60 * 1000; // 30分钟一段
        this.isRecording = false;
        this.recorder = null;
        this.stream = null;
        this.video = null;
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
            this.segmentTimer = setInterval(() => {
                this.autoSegment();
            }, this.segmentDuration);

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

        // 自动合并所有片段
        await this.mergeSegments();

        this.removeSegmentFloat();
        this.cleanup();
    }

    async mergeSegments() {
        if (this.segments.length === 0) return;

        try {
            // 创建合并后的文件
            const mergedBlob = new Blob(this.segments, { type: 'video/webm' });
            const url = URL.createObjectURL(mergedBlob);

            let title = document.title || 'recorded';
            if (title.length > 20) title = title.slice(0, 20) + '...';
            title = title.replace(/[\\/:*?"<>|]/g, '_');

            const now = new Date();
            const pad = n => n.toString().padStart(2, '0');
            const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

            const a = document.createElement('a');
            a.href = url;
            a.download = `${title}_完整录制_${timestamp}.webm`;
            a.click();

            setTimeout(() => URL.revokeObjectURL(url), 10000);

            alert(`录制完成！共 ${this.segments.length} 个片段，已自动合并。`);

        } catch (error) {
            alert('合并文件失败：' + error.message);
        }
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
            <div style="margin-bottom:8px;font-weight:bold;color:#4CAF50;">● 分段录制中</div>
            <div id="segment-info" style="margin-bottom:8px;">
                <div>当前片段：第 <span id="current-segment">1</span> 段</div>
                <div>已保存：<span id="saved-segments">0</span> 个片段</div>
                <div>总时长：<span id="total-time">00:00:00</span></div>
            </div>
            <button id="stop-segment-btn" style="background:#e53935;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">停止录制</button>
        `;

        document.body.appendChild(float);

        // 停止按钮事件
        document.getElementById('stop-segment-btn').onclick = () => {
            this.stopRecording();
        };

        // 拖动功能
        let isDragging = false;
        let offsetX = 0, offsetY = 0;

        float.addEventListener('mousedown', (e) => {
            if (e.target.id === 'stop-segment-btn') return;
            isDragging = true;
            offsetX = e.clientX - float.getBoundingClientRect().left;
            offsetY = e.clientY - float.getBoundingClientRect().top;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            float.style.left = (e.clientX - offsetX) + 'px';
            float.style.top = (e.clientY - offsetY) + 'px';
            float.style.right = '';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // 启动信息更新定时器
        this.infoTimer = setInterval(() => {
            this.updateFloatInfo();
        }, 1000);
    }

    updateFloatInfo() {
        const currentSegmentEl = document.getElementById('current-segment');
        const savedSegmentsEl = document.getElementById('saved-segments');
        const totalTimeEl = document.getElementById('total-time');

        if (currentSegmentEl) {
            currentSegmentEl.textContent = this.currentSegment + 1;
        }
        if (savedSegmentsEl) {
            savedSegmentsEl.textContent = this.segments.length;
        }
        if (totalTimeEl) {
            const totalSeconds = Math.floor((Date.now() - this.recordingStartTime) / 1000);
            const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
            const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const ss = String(totalSeconds % 60).padStart(2, '0');
            totalTimeEl.textContent = `${hh}:${mm}:${ss}`;
        }
    }

    removeSegmentFloat() {
        const float = document.getElementById('segment-recorder-float');
        if (float) {
            float.remove();
        }
        if (this.infoTimer) {
            clearInterval(this.infoTimer);
        }
    }

    handleError(error) {
        console.error('分段录制错误：', error);
        alert('录制过程中发生错误，正在尝试恢复...');

        // 尝试重新开始当前片段
        setTimeout(() => {
            if (this.isRecording) {
                this.startSegment();
            }
        }, 2000);
    }

    cleanup() {
        this.segments = [];
        this.currentSegment = 0;
        this.isRecording = false;
        this.recorder = null;
        this.stream = null;
        this.video = null;
    }
}

// 全局分段录制实例
window.segmentRecorder = new SegmentRecorder();

// 启动分段录制
window.startSegmentRecording = () => {
    window.segmentRecorder.startRecording();
};

// 停止分段录制
window.stopSegmentRecording = () => {
    window.segmentRecorder.stopRecording();
};
=======
// 只录制第一个<video>标签
window.startMyRecorder = async () => {
    try {
        const video = document.querySelector('video');
        if (!video) {
            alert('未找到视频元素');
            return;
        }
        let stream;
        try {
            stream = video.captureStream(30); // 尝试高帧率
        } catch (e) {
            alert('无法捕获视频流，可能该视频不支持录制。');
            return;
        }
        let recorder;
        try {
            recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 5_000_000
            });
        } catch (e) {
            alert('浏览器不支持 MediaRecorder 或参数不兼容。');
            return;
        }
        const chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = e => {
            try {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                let title = document.title || 'recorded';
                if (title.length > 30) title = title.slice(0, 30) + '...';
                title = title.replace(/[\\/:*?"<>|]/g, '_');
                const now = new Date();
                const pad = n => n.toString().padStart(2, '0');
                const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title}_${timestamp}.webm`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
            } catch (err) {
                alert('保存录制文件时发生异常：' + err.message);
            }
            removeRecorderFloat();
            window.removeEventListener('beforeunload', autoStopRecorder);
            window.removeEventListener('pagehide', autoStopRecorder);
        };
        recorder.onerror = e => {
            alert('录制过程中发生错误：' + (e.error && e.error.message ? e.error.message : e.message || e));
        };
        recorder.onpause = () => {
            alert('录制已暂停。');
        };
        recorder.onresume = () => {
            alert('录制已恢复。');
        };
        try {
            recorder.start();
        } catch (e) {
            alert('启动录制失败：' + e.message);
            return;
        }
        chrome.runtime.sendMessage({ type: 'recorder_started' });
        showRecorderFloat(() => {
            try {
                recorder.stop();
            } catch (e) {
                alert('停止录制时发生异常：' + e.message);
            }
        });
        window.stopMyRecorder = () => {
            try {
                recorder.stop();
            } catch (e) {
                alert('停止录制时发生异常：' + e.message);
            }
        };
        // 新增：监听页面关闭/刷新/跳转，自动停止录制
        function autoStopRecorder() {
            if (recorder.state === 'recording') {
                try {
                    recorder.stop();
                } catch (e) {
                    alert('自动停止录制时发生异常：' + e.message);
                }
            }
        }
        window.addEventListener('beforeunload', autoStopRecorder);
        window.addEventListener('pagehide', autoStopRecorder);
    } catch (err) {
        alert('录制初始化时发生异常：' + err.message);
    }
};

// 悬浮窗相关
function showRecorderFloat(onStop) {
    removeRecorderFloat();
    const float = document.createElement('div');
    float.id = 'my-recorder-float';
    float.style.position = 'fixed';
    float.style.top = '30px';
    float.style.right = '30px';
    float.style.zIndex = '999999';
    float.style.background = 'rgba(30,30,30,0.92)';
    float.style.color = '#fff';
    float.style.padding = '14px 22px';
    float.style.borderRadius = '12px';
    float.style.boxShadow = '0 4px 24px rgba(0,0,0,0.18)';
    float.style.fontSize = '16px';
    float.style.display = 'flex';
    float.style.alignItems = 'center';
    float.style.cursor = 'move';
    float.style.userSelect = 'none';

    // 计时器
    const timeSpan = document.createElement('span');
    timeSpan.id = 'recorder-timer';
    timeSpan.style.fontSize = '22px';
    timeSpan.style.fontWeight = 'bold';
    timeSpan.style.letterSpacing = '1px';
    timeSpan.style.marginRight = '18px';
    timeSpan.textContent = '00:00:00';
    float.appendChild(timeSpan);

    // 红色圆点+提示
    const statusSpan = document.createElement('span');
    statusSpan.innerHTML = '<span style="display:inline-block;width:10px;height:10px;background:#e53935;border-radius:50%;margin-right:7px;vertical-align:middle;"></span>正在录屏...';
    statusSpan.style.marginRight = '18px';
    statusSpan.style.fontSize = '15px';
    float.appendChild(statusSpan);

    // 停止按钮
    const stopBtn = document.createElement('button');
    stopBtn.textContent = '■ 停止';
    stopBtn.style.background = '#e53935';
    stopBtn.style.color = '#fff';
    stopBtn.style.border = 'none';
    stopBtn.style.borderRadius = '6px';
    stopBtn.style.padding = '7px 18px';
    stopBtn.style.fontSize = '16px';
    stopBtn.style.fontWeight = 'bold';
    stopBtn.style.marginLeft = '8px';
    stopBtn.style.cursor = 'pointer';
    stopBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
    stopBtn.onmousedown = e => e.stopPropagation(); // 防止拖动
    stopBtn.onclick = (e) => {
        e.stopPropagation();
        if (onStop) onStop();
    };
    float.appendChild(stopBtn);
    document.body.appendChild(float);

    // 计时逻辑（支持小时）
    let seconds = 0;
    window._recorderTimer = setInterval(() => {
        seconds++;
        const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
        const ss = String(seconds % 60).padStart(2, '0');
        timeSpan.textContent = `${hh}:${mm}:${ss}`;
    }, 1000);

    // 拖动逻辑
    let isDragging = false;
    let offsetX = 0, offsetY = 0;
    float.addEventListener('mousedown', function (e) {
        if (e.target === stopBtn) return;
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
}

function removeRecorderFloat() {
    if (window._recorderTimer) {
        clearInterval(window._recorderTimer);
        window._recorderTimer = null;
    }
    const exist = document.getElementById('my-recorder-float');
    if (exist) exist.remove();
}
>>>>>>> 669925d6fb0d7266ef8efb808c602034706c14d8
