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