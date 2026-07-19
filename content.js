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
            this.segmentIndex = 1;
            this.maxSegmentDuration = 30 * 60;
            this.lastSegmentTime = 0;
            this.pendingSegmentSave = null;
            this.recordingMimeType = this.getPreferredMimeType();
            this._isRestarting = false;
            this._isStopping = false;
            this._restartTimers = [];
            this._restartDeadline = null;
            this._lastVideoSrc = '';
            this._currentSrcPoller = null;
            this.videoObserver = null;
            this.videoSrcObserver = null;
            this._beforeUnloadHandler = null;
            this._floatDragCleanup = null;
        }

        getPreferredMimeType() {
            const candidates = [
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm'
            ];
            return candidates.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
        }

        safeSendMessage(message) {
            try {
                chrome.runtime.sendMessage(message);
            } catch (error) {
                console.warn('发送扩展消息失败（上下文可能已失效）:', error);
            }
        }

        showToast(msg, duration = 3000) {
            const existing = document.getElementById('video-recorder-toast');
            if (existing) existing.remove();
            const toast = document.createElement('div');
            toast.id = 'video-recorder-toast';
            toast.textContent = msg;
            toast.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                z-index: 9999999; background: rgba(30,30,30,0.92); color: #fff;
                padding: 10px 24px; border-radius: 8px; font-size: 14px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.3); pointer-events: none;
                transition: opacity 0.3s; opacity: 1;
            `;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
            }, duration);
        }

        // ════════════════════════════════════════════════════════
        // 【新增】每次都重新从 DOM 查询，避免 this.video 引用失效
        // ════════════════════════════════════════════════════════
        findVideoElement() {
            const v = document.querySelector('video');
            if (v && v.isConnected) return v;
            return null;
        }

        async startRecording() {
            try {
                const video = this.findVideoElement();
                if (!video) {
                    this.showToast('未找到视频元素', 4000);
                    return;
                }
                this.video = video;

                this.stream = this.video.captureStream(30);
                this.recordingStartTime = Date.now();
                this.isRecording = true;
                this.chunks = [];
                this.segmentIndex = 1;
                this.lastSegmentTime = Date.now();
                this._lastVideoSrc = this.video.currentSrc || this.video.src;

                this.safeSendMessage({ type: 'recording_started' });
                this.createRecorder();
                console.log('开始录制');

                this.setupStreamStopListeners();
                this.setupVideoSourceChangeDetector();
                this.setupBeforeUnload();
                this.showRecordingFloat();

            } catch (error) {
                this.showToast('启动录制失败：' + error.message, 5000);
                this.isRecording = false;
                this.showRecordingFloat();
            }
        }

        createRecorder() {
            this.recorder = new MediaRecorder(this.stream, {
                mimeType: this.recordingMimeType,
                videoBitsPerSecond: 3_000_000
            });

            this.recorder.ondataavailable = e => {
                if (e.data && e.data.size > 0) {
                    this.chunks.push(e.data);
                    const now = Date.now();
                    if (now - this.lastSegmentTime >= this.maxSegmentDuration * 1000) {
                        this.requestSegmentSave(false);
                    }
                }
            };

            this.recorder.onstop = () => {
                const task = this.pendingSegmentSave;
                this.pendingSegmentSave = null;

                if (this.chunks.length > 0) {
                    try {
                        this.saveSegment(task ? task.isFinal : true);
                    } catch (error) {
                        console.error('保存片段失败：', error);
                    }
                }

                if (task && task.isSourceSwitch) {
                    this._restartRecording();
                    return;
                }

                if (!task || !task.isFinal) {
                    if (this.isRecording && this.stream) {
                        this.lastSegmentTime = Date.now();
                        this.createRecorder();
                    }
                } else {
                    this._isStopping = false;
                }
            };

            this.recorder.start(1000);
        }

        requestSegmentSave(isFinal) {
            if (!this.recorder || this.recorder.state !== 'recording' || this.pendingSegmentSave) {
                return;
            }
            this.pendingSegmentSave = { isFinal };
            this.recorder.stop();
        }

        // ════════════════════════════════════════════════════════
        // 【新增】统一入口：检测到视频源变化时保存当前片段并尝试重启
        // （由 stream.inactive / 元素移除 / src 变化 / currentSrc 变化 共同调用）
        // ════════════════════════════════════════════════════════
        _triggerSourceSwitchSave() {
            if (this._isRestarting) return;
            if (this._isStopping) return;
            if (this.pendingSegmentSave) return;

            this._isRestarting = true;
            this.showToast('检测到视频源变化，正在保存当前片段...', 3000);

            if (this.recorder && this.recorder.state === 'recording') {
                // 保存为 _partXXX.webm（非 final），标记为源切换，由 onstop 触发重启
                this.pendingSegmentSave = { isFinal: false, isSourceSwitch: true };
                this.recorder.stop();
            } else if (this.chunks.length > 0) {
                this.saveSegment(false);
                this._restartRecording();
            } else {
                this._restartRecording();
            }
        }

        // ════════════════════════════════════════════════════════
        // 【重写】不再使用旧的 this.video，每次都重新 findVideoElement()
        // ════════════════════════════════════════════════════════
        _restartRecording() {
            const attempt = () => {
                const video = this.findVideoElement();
                if (!video) {
                    this._scheduleRetry(attempt, '等待视频元素出现...');
                    return;
                }
                if (video.readyState < 2) {
                    this._scheduleRetry(attempt, '等待视频加载...');
                    return;
                }
                try {
                    const newStream = video.captureStream(30);
                    if (!newStream || newStream.getVideoTracks().length === 0) {
                        throw new Error('新视频流无有效轨道');
                    }

                    // 成功获取新流，重置状态（但保留分段编号）
                    this.video = video;
                    this.stream = newStream;
                    this.recordingStartTime = Date.now();
                    this.isRecording = true;
                    this.chunks = [];
                    this.lastSegmentTime = Date.now();
                    this._lastVideoSrc = video.currentSrc || video.src;

                    // 清理重启相关状态
                    clearTimeout(this._restartDeadline);
                    this._restartDeadline = null;
                    this._restartTimers.forEach(t => clearTimeout(t));
                    this._restartTimers = [];
                    this._isRestarting = false;

                    // 为新视频元素重建所有监听器
                    this.setupStreamStopListeners();
                    this.setupVideoSourceChangeDetector();
                    this.createRecorder();
                    this.updateFloatUI();
                    this.safeSendMessage({ type: 'recording_started' });
                    this.showToast('已切换至新视频源，继续录制', 3000);
                } catch (error) {
                    console.error('重启录制失败:', error);
                    this._scheduleRetry(attempt, '重启录制失败，重试中...');
                }
            };

            attempt();
        }

        _scheduleRetry(attempt, msg) {
            this.showToast(msg, 2000);
            const timer = setTimeout(() => {
                const idx = this._restartTimers.indexOf(timer);
                if (idx >= 0) this._restartTimers.splice(idx, 1);
                attempt();
            }, 800);
            this._restartTimers.push(timer);

            // 全局 20 秒超时保护
            if (!this._restartDeadline) {
                this._restartDeadline = setTimeout(() => {
                    if (this._isRestarting) {
                        this._failRestart('视频源切换超时，请手动重新开始录制');
                    }
                }, 20000);
            }
        }

        _failRestart(msg) {
            clearTimeout(this._restartDeadline);
            this._restartDeadline = null;
            this._restartTimers.forEach(t => clearTimeout(t));
            this._restartTimers = [];
            this._isRestarting = false;
            this.isRecording = false;
            this.showToast(msg, 5000);
            this.safeSendMessage({ type: 'recording_stopped' });
            this.updateFloatUI();
        }

        async saveSegment(isFinal) {
            try {
                if (this.chunks.length === 0) return;

                const blobType = this.chunks[0]?.type || this.recordingMimeType || 'video/webm';
                const blob = new Blob([...this.chunks], { type: blobType });
                const url = URL.createObjectURL(blob);
                let title = document.title || 'recorded';
                if (title.length > 20) title = title.slice(0, 20) + '...';
                title = title.replace(/[\\/:*?"<>|]/g, '_');

                const now = new Date();
                const pad = n => n.toString().padStart(2, '0');
                const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

                const segmentSuffix = `_part${this.segmentIndex.toString().padStart(3, '0')}`;
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title}_${timestamp}${segmentSuffix}.webm`;
                a.click();

                setTimeout(() => URL.revokeObjectURL(url), 10000);

                if (isFinal) {
                    this.showToast(`录制完成！共保存 ${this.segmentIndex} 个片段`, 5000);
                }
                this.segmentIndex++;
                this.chunks = [];
            } catch (error) {
                console.error('保存片段失败：', error);
            }
        }

        async stopRecording() {
            if (this._isRestarting) return;
            if (this._isStopping) return;
            if (this.pendingSegmentSave) return;
            if (!this.isRecording && this.chunks.length === 0) return;

            this._isStopping = true;
            this.isRecording = false;

            if (this.recorder && this.recorder.state === 'recording') {
                this.pendingSegmentSave = { isFinal: true };
                this.recorder.stop();
            } else if (this.chunks.length > 0) {
                this.saveSegment(true);
                this._isStopping = false;
            } else {
                this._isStopping = false;
            }

            this.safeSendMessage({ type: 'recording_stopped' });

            if (this.videoObserver) { this.videoObserver.disconnect(); this.videoObserver = null; }
            if (this.videoSrcObserver) { this.videoSrcObserver.disconnect(); this.videoSrcObserver = null; }
            if (this._currentSrcPoller) { clearInterval(this._currentSrcPoller); this._currentSrcPoller = null; }
            if (this._beforeUnloadHandler) { window.removeEventListener('beforeunload', this._beforeUnloadHandler); this._beforeUnloadHandler = null; }
            if (this.infoTimer) { clearInterval(this.infoTimer); this.infoTimer = null; }
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
            const onMouseMove = (e) => {
                if (!isDragging) return;
                float.style.left = (e.clientX - offsetX) + 'px';
                float.style.top = (e.clientY - offsetY) + 'px';
                float.style.right = '';
            };
            const onMouseUp = () => { isDragging = false; document.body.style.userSelect = ''; };
            const onMouseDown = (e) => {
                if (e.target.tagName === 'BUTTON') return;
                isDragging = true;
                offsetX = e.clientX - float.getBoundingClientRect().left;
                offsetY = e.clientY - float.getBoundingClientRect().top;
                document.body.style.userSelect = 'none';
            };

            float.addEventListener('mousedown', onMouseDown);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);

            this._floatDragCleanup = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            this.updateFloatUI();
        }

        updateFloatUI() {
            const float = document.getElementById('video-recorder-float');
            if (!float) return;
            const pad = n => n.toString().padStart(2, '0');

            if (this.isRecording) {
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
                document.getElementById('stop-recording-btn').onclick = () => this.stopRecording();
                if (!this.infoTimer) this.infoTimer = setInterval(() => this.updateFloatUI(), 1000);
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
                document.getElementById('start-recording-btn').onclick = () => this.startRecording();
                document.getElementById('close-float-btn').onclick = () => this.removeRecordingFloat();
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
            if (this._floatDragCleanup) { this._floatDragCleanup(); this._floatDragCleanup = null; }
            const float = document.getElementById('video-recorder-float');
            if (float) float.remove();
            if (this.infoTimer) { clearInterval(this.infoTimer); this.infoTimer = null; }
        }

        // ════════════════════════════════════════════════════════
        // 【重写】视频流中断/元素移除 → 不再直接 stopRecording()
        // 而是调用 _triggerSourceSwitchSave() 尝试切换到新视频源
        // ════════════════════════════════════════════════════════
        setupStreamStopListeners() {
            this.stream.addEventListener('inactive', () => {
                if (this.isRecording && !this._isRestarting) {
                    console.log('视频流已中断，尝试保存并切换');
                    this._triggerSourceSwitchSave();
                }
            });

            if (this.video) {
                this.video.addEventListener('ended', () => {
                    if (this.isRecording && !this._isRestarting) {
                        console.log('视频播放结束，尝试保存并切换');
                        this._triggerSourceSwitchSave();
                    }
                });
            }

            if (this.videoObserver) { this.videoObserver.disconnect(); }
            this.videoObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.removedNodes.length > 0) {
                        for (const node of mutation.removedNodes) {
                            // 匹配：当前 video 元素本身 或 包含它的父元素 被移除
                            if (node === this.video || (this.video && node.contains && node.contains(this.video))) {
                                if (this.isRecording && !this._isRestarting) {
                                    console.log('视频元素已移除，尝试切换到新视频');
                                    this._triggerSourceSwitchSave();
                                }
                                return;
                            }
                        }
                    }
                }
            });
            this.videoObserver.observe(document.body, { childList: true, subtree: true });
        }

        // ════════════════════════════════════════════════════════
        // 【重写】添加 currentSrc 轮询检测（很多播放器不改 src 属性只改 currentSrc）
        // ════════════════════════════════════════════════════════
        setupVideoSourceChangeDetector() {
            if (this.videoSrcObserver) { this.videoSrcObserver.disconnect(); }

            // 方式一：监听 src 属性变化（传统播放器）
            this.videoSrcObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                        if (this.isRecording && !this._isRestarting) {
                            const oldSrc = mutation.oldValue;
                            const newSrc = this.video ? this.video.src : '';
                            if (oldSrc && newSrc && oldSrc !== newSrc) {
                                console.log('视频 src 属性已变化');
                                this._triggerSourceSwitchSave();
                            }
                        }
                        return;
                    }
                }
            });
            if (this.video) {
                this.videoSrcObserver.observe(this.video, {
                    attributes: true,
                    attributeFilter: ['src'],
                    attributeOldValue: true
                });
            }

            // 方式二：currentSrc 轮询（常见于现代流媒体播放器）
            if (this._currentSrcPoller) { clearInterval(this._currentSrcPoller); }
            this._currentSrcPoller = setInterval(() => {
                if (this.isRecording && !this._isRestarting && this.video) {
                    const currentSrc = this.video.currentSrc || this.video.src;
                    if (this._lastVideoSrc && currentSrc && currentSrc !== this._lastVideoSrc) {
                        console.log('视频 currentSrc 已变化:', this._lastVideoSrc, '→', currentSrc);
                        this._triggerSourceSwitchSave();
                    }
                }
            }, 1000);
        }

        setupBeforeUnload() {
            this._beforeUnloadHandler = () => {
                if (this.isRecording && this.chunks.length > 0) {
                    this.isRecording = false;
                    this.saveSegment(true);
                    if (this.recorder && this.recorder.state === 'recording') {
                        this.recorder.stop();
                    }
                    this.safeSendMessage({ type: 'recording_stopped' });
                }
            };
            window.addEventListener('beforeunload', this._beforeUnloadHandler);
        }

        cleanup() {
            this.recordingStartTime = 0;
            this.isRecording = false;
            this.recorder = null;
            this.stream = null;
            this.video = null;
            this.chunks = [];
            this.segmentIndex = 1;

            if (this.infoTimer) { clearInterval(this.infoTimer); this.infoTimer = null; }
            if (this.videoObserver) { this.videoObserver.disconnect(); this.videoObserver = null; }
            if (this.videoSrcObserver) { this.videoSrcObserver.disconnect(); this.videoSrcObserver = null; }
            if (this._currentSrcPoller) { clearInterval(this._currentSrcPoller); this._currentSrcPoller = null; }

            clearTimeout(this._restartDeadline);
            this._restartDeadline = null;
            this._restartTimers.forEach(t => clearTimeout(t));
            this._restartTimers = [];
            this._isRestarting = false;
            this._isStopping = false;

            if (this._beforeUnloadHandler) {
                window.removeEventListener('beforeunload', this._beforeUnloadHandler);
                this._beforeUnloadHandler = null;
            }
            if (this._floatDragCleanup) {
                this._floatDragCleanup();
                this._floatDragCleanup = null;
            }
        }

        handleError(error) {
            console.error('录制错误：', error);
            this.showToast('录制过程中发生错误：' + error.message, 6000);
            this.stopRecording();
        }
    }

    window.videoRecorder = new VideoRecorder();
}