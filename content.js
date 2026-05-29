// 防止重复注入
if (!window.__videoRecorderInjected) {
    window.__videoRecorderInjected = true;

    class VideoRecorder {
        constructor() {
            this.recordingStartTime = 0;
            this.isRecording = false;
            this.recorder = null;
            this.stream = null;
            this.video = null;
            this.infoTimer = null;
            this.chunks = [];
            this.segmentIndex = 0;
            this.maxSegmentDuration = 30 * 60; // 每段最大时长（秒）
            this.lastSegmentTime = 0;
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
                this.chunks = [];
                this.segmentIndex = 0;
                this.lastSegmentTime = Date.now();

                chrome.runtime.sendMessage({ type: 'recording_started' });

                this.recorder = new MediaRecorder(this.stream, {
                    mimeType: 'video/webm;codecs=vp9',
                    videoBitsPerSecond: 3_000_000
                });

                // 使用 timeslice 实现无缝分段：录制不中断
                this.recorder.ondataavailable = e => {
                    if (e.data && e.data.size > 0) {
                        this.chunks.push(e.data);
                        
                        // 检查是否达到分段时间
                        const now = Date.now();
                        if (now - this.lastSegmentTime >= this.maxSegmentDuration * 1000) {
                            this.saveSegment(false);
                            this.lastSegmentTime = now;
                        }
                    }
                };

                this.recorder.onstop = () => {
                    if (this.chunks.length > 0) {
                        this.saveSegment(true);
                    }
                };

                // 每秒触发一次数据事件，实现无缝录制
                this.recorder.start(1000);
                console.log('开始录制');

                this.setupStreamStopListeners();
                this.showRecordingFloat();

            } catch (error) {
                alert('启动录制失败：' + error.message);
                this.isRecording = false;
                this.showRecordingFloat();
            }
        }

        async saveSegment(isFinal) {
            try {
                if (this.chunks.length === 0) return;

                const blob = new Blob([...this.chunks], { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                let title = document.title || 'recorded';
                if (title.length > 20) title = title.slice(0, 20) + '...';
                title = title.replace(/[\\/:*?"<>|]/g, '_');

                const now = new Date();
                const pad = n => n.toString().padStart(2, '0');
                const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

                const segmentSuffix = isFinal ? '_final' : `_part${this.segmentIndex.toString().padStart(3, '0')}`;
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title}_${timestamp}${segmentSuffix}.webm`;
                a.click();

                setTimeout(() => URL.revokeObjectURL(url), 10000);

                if (!isFinal) {
                    this.segmentIndex++;
                } else {
                    alert(`录制完成！共生成 ${this.segmentIndex + 1} 个片段`);
                }

                // 清空缓冲区，继续累积新数据
                this.chunks = [];

            } catch (error) {
                console.error('保存片段失败：', error);
            }
        }

        async stopRecording() {
            this.isRecording = false;

            if (this.recorder && this.recorder.state === 'recording') {
                this.recorder.stop();
            }

            chrome.runtime.sendMessage({ type: 'recording_stopped' });

            // 停止计时器
            if (this.infoTimer) {
                clearInterval(this.infoTimer);
                this.infoTimer = null;
            }

            // 更新UI显示为停止状态
            this.updateFloatUI();
        }

        showRecordingFloat() {
            if (document.getElementById('video-recorder-float')) {
                this.updateFloatUI();
                return;
            }

            const float = document.createElement('div');
            float.id = 'video-recorder-float';
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
            float.style.minWidth = '320px';
            float.style.cursor = 'move';

            document.body.appendChild(float);

            let isDragging = false;
            let offsetX = 0, offsetY = 0;
            float.addEventListener('mousedown', function (e) {
                if (e.target.tagName === 'BUTTON') return;
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

            this.updateFloatUI();
        }

        updateFloatUI() {
            const float = document.getElementById('video-recorder-float');
            if (!float) return;

            const pad = n => n.toString().padStart(2, '0');

            if (this.isRecording) {
                // 计算录制时长
                const elapsed = this.recordingStartTime ? Math.floor((Date.now() - this.recordingStartTime) / 1000) : 0;
                const hours = pad(Math.floor(elapsed / 3600));
                const minutes = pad(Math.floor((elapsed % 3600) / 60));
                const seconds = pad(elapsed % 60);

                float.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                        <span style="font-weight:bold;color:#4CAF50;">● 录制中</span>
                        <span>录制时长：${hours}:${minutes}:${seconds}</span>
                        <button id="stop-recording-btn" style="background:#e53935;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">停止录制</button>
                    </div>
                `;

                document.getElementById('stop-recording-btn').onclick = () => {
                    this.stopRecording();
                };

                // 启动计时器更新UI
                if (!this.infoTimer) {
                    this.infoTimer = setInterval(() => this.updateFloatUI(), 1000);
                }
            } else {
                float.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                        <span style="font-weight:bold;color:#666;">● 未录制</span>
                        <span>录制时长：00:00:00</span>
                        <div style="display:flex;gap:8px;">
                            <button id="start-recording-btn" style="background:#4CAF50;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">开始录制</button>
                            <button id="close-float-btn" style="background:#666;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">关闭</button>
                        </div>
                    </div>
                `;

                document.getElementById('start-recording-btn').onclick = () => {
                    this.startRecording();
                };

                document.getElementById('close-float-btn').onclick = () => {
                    this.removeRecordingFloat();
                };
            }
        }

        updateRecordingInfo() {
            const timeEl = document.getElementById('recording-time');
            if (timeEl && this.recordingStartTime) {
                const totalSeconds = Math.floor((Date.now() - this.recordingStartTime) / 1000);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const seconds = totalSeconds % 60;
                timeEl.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }

        removeRecordingFloat() {
            const float = document.getElementById('video-recorder-float');
            if (float) float.remove();

            if (this.infoTimer) {
                clearInterval(this.infoTimer);
                this.infoTimer = null;
            }
        }

        setupStreamStopListeners() {
            this.stream.addEventListener('inactive', () => {
                if (this.isRecording) {
                    console.log('视频流已中断，自动停止录制');
                    this.stopRecording();
                }
            });

            this.video.addEventListener('ended', () => {
                if (this.isRecording) {
                    console.log('视频播放结束，自动停止录制');
                    this.stopRecording();
                }
            });

            this.videoObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.removedNodes.length > 0) {
                        for (const node of mutation.removedNodes) {
                            if (node === this.video) {
                                if (this.isRecording) {
                                    console.log('视频元素已移除，自动停止录制');
                                    this.stopRecording();
                                }
                                this.videoObserver.disconnect();
                                return;
                            }
                        }
                    }
                }
            });

            this.videoObserver.observe(document.body, { childList: true, subtree: true });
        }

        cleanup() {
            this.recordingStartTime = 0;
            this.isRecording = false;
            this.recorder = null;
            this.stream = null;
            this.video = null;
            this.chunks = [];
            this.segmentIndex = 0;

            if (this.infoTimer) {
                clearInterval(this.infoTimer);
                this.infoTimer = null;
            }

            if (this.videoObserver) {
                this.videoObserver.disconnect();
                this.videoObserver = null;
            }
        }

        handleError(error) {
            console.error('录制错误：', error);
            alert('录制过程中发生错误：' + error.message);
            this.stopRecording();
        }
    }

    window.videoRecorder = new VideoRecorder();

    window.startRecording = () => {
        window.videoRecorder.startRecording();
    };

    window.stopRecording = () => {
        window.videoRecorder.stopRecording();
    };
}