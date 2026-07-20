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
        // 【增强】遍历所有 video 元素，选择真正在播放的那个
        // （直播页常有多个 video，第一个往往是占位/隐藏元素）
        // 同时搜索 shadow DOM
        // ════════════════════════════════════════════════════════
        _videoIsVisiblyPlaying(video) {
            if (!video || !video.isConnected) return false;
            // 标准：有源且非 paused/ended
            const hasSrc = !!(video.currentSrc || video.src);
            const visuallyPlaying = !video.paused && !video.ended;
            if (hasSrc && visuallyPlaying) return true;
            // 兼容：有些播放器把 video 设为 paused，但实际在播放
            // 用 readyState 和 currentTime 作为辅助判断
            const readyEnough = video.readyState >= 2;
            const hasProgress = video.currentTime > 0;
            const hasDuration = !isNaN(video.duration) && video.duration > 0;
            const visible = video.offsetParent !== null && getComputedStyle(video).visibility !== 'hidden' && getComputedStyle(video).display !== 'none';
            const hasTracks = (video.videoWidth > 0 && video.videoHeight > 0) || (typeof video.audioTracks !== 'undefined' && video.audioTracks.length > 0);
            if (hasSrc && (hasProgress || (readyEnough && (visible || hasTracks)))) return true;
            return false;
        }

        _collectVideos(root = document, results = []) {
            if (!root) return results;
            const videos = root.querySelectorAll ? root.querySelectorAll('video') : [];
            videos.forEach(v => results.push(v));
            // 递归搜索 shadow DOM
            const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
            all.forEach(el => {
                if (el.shadowRoot) this._collectVideos(el.shadowRoot, results);
            });
            return results;
        }

        findVideoElement() {
            const allVideos = [];
            this._collectVideos(document, allVideos);
            if (allVideos.length === 0) return null;

            // 1) 优先选明显在播放的
            let playing = allVideos.filter(v => this._videoIsVisiblyPlaying(v));
            if (playing.length > 0) {
                // 优先选可见、画面较大的
                playing.sort((a, b) => ((b.videoWidth || 0) * (b.videoHeight || 0)) - ((a.videoWidth || 0) * (a.videoHeight || 0)));
                return playing[0];
            }

            // 2) 其次选有 currentSrc 且 readyState >= 2 的
            let withSrc = allVideos.filter(v => (v.currentSrc || v.src) && v.readyState >= 2);
            if (withSrc.length > 0) {
                withSrc.sort((a, b) => ((b.videoWidth || 0) * (b.videoHeight || 0)) - ((a.videoWidth || 0) * (a.videoHeight || 0)));
                return withSrc[0];
            }

            // 3) 退而求其次：返回第一个 isConnected 且有 src 的
            let fallback = allVideos.find(v => v.isConnected && (v.currentSrc || v.src));
            if (fallback) return fallback;

            // 4) 最后返回第一个 isConnected 的
            return allVideos.find(v => v.isConnected) || null;
        }

        async startRecording() {
            try {
                const video = this.findVideoElement();
                if (!video) {
                    this.showToast('未找到视频元素，可尝试整页录屏', 5000);
                    return;
                }
                this.video = video;

                const stream = await this._captureStreamWithRetry(this.video);
                if (!stream) {
                    throw new Error('无法捕获视频流：页面可能使用加密/DRM播放，或视频尚未开始播放');
                }
                this.stream = stream;

                if (this.stream.getVideoTracks().length === 0 && this.stream.getAudioTracks().length === 0) {
                    throw new Error('捕获到空流：该视频可能受 DRM 保护或使用自定义渲染方式，无法录制');
                }

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
                this.showToast('启动录制失败：' + error.message + '（可点击"整页录屏"试试）', 8000);
                this.isRecording = false;
                this.showRecordingFloat();
            }
        }

        _captureStream(video, fps = 30) {
            try {
                if (typeof video.captureStream === 'function') {
                    return video.captureStream(fps);
                }
            } catch (e) { /* ignore */ }
            try {
                if (typeof video.mozCaptureStream === 'function') {
                    return video.mozCaptureStream(fps);
                }
            } catch (e) { /* ignore */ }
            return null;
        }

        async _captureStreamWithRetry(video, maxWaitMs = 8000) {
            const startTime = Date.now();
            const pollInterval = 500;
            let lastError = null;

            while (Date.now() - startTime < maxWaitMs) {
                try {
                    const stream = this._captureStream(video, 30);
                    if (!stream) {
                        throw new Error('浏览器不支持 captureStream');
                    }

                    const hasVideo = stream.getVideoTracks().length > 0;
                    const hasAudio = stream.getAudioTracks().length > 0;

                    if (hasVideo || hasAudio) {
                        console.log(`捕获到流：视频=${hasVideo}, 音频=${hasAudio}`, stream);
                        return stream;
                    }

                    lastError = '未检测到音/视频轨道';
                    if (video.paused || video.ended) {
                        lastError = '视频处于暂停/结束状态，请先播放视频';
                    } else if (video.readyState < 2) {
                        lastError = '视频尚未加载完成（readyState=' + video.readyState + '）';
                    } else if (!video.currentSrc) {
                        lastError = '视频 currentSrc 为空';
                    }

                    console.warn('captureStream 捕获为空，等待重试...', {
                        readyState: video.readyState,
                        paused: video.paused,
                        currentSrc: video.currentSrc,
                        tracks: { video: stream.getVideoTracks().length, audio: stream.getAudioTracks().length }
                    });

                    stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
                } catch (e) {
                    lastError = e.message;
                    console.warn('captureStream 异常:', e);
                }

                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }

            throw new Error(lastError || '超时仍未获取到可用音视频轨道');
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
                    const newStream = this._captureStream(video, 30);
                    if (!newStream || (newStream.getVideoTracks().length === 0 && newStream.getAudioTracks().length === 0)) {
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

            const wasTabCapture = this._tabCaptureMode;

            // ── 停止 MediaRecorder（两种模式共用） ──
            if (this.recorder && this.recorder.state === 'recording') {
                this.pendingSegmentSave = { isFinal: true };
                this.recorder.stop();
            } else if (this.chunks.length > 0) {
                this.saveSegment(true);
                this._isStopping = false;
            } else {
                this._isStopping = false;
            }

            // ── tabCapture 模式：额外停止 stream 轨道 ──
            if (wasTabCapture && this.stream) {
                try {
                    this.stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
                } catch (_) {}
            }

            this._tabCaptureMode = false;
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
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                            <span style="font-weight:bold;color:#4CAF50;">● ${this._tabCaptureMode ? '整页录制中' : '录制中'}</span>
                            <span>录制时长：${hours}:${minutes}:${seconds}</span>
                            <button id="stop-recording-btn" style="background:#e53935;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">停止录制</button>
                        </div>
                    </div>
                `;
                document.getElementById('stop-recording-btn').onclick = () => this.stopRecording();
                if (!this.infoTimer) this.infoTimer = setInterval(() => this.updateFloatUI(), 1000);
            } else {
                float.innerHTML = `
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                            <span style="font-weight:bold;color:#666;">● 未录制</span>
                            <span>录制时长：00:00:00</span>
                            <div style="display:flex;gap:8px;">
                                <button id="close-float-btn" style="background:#666;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">关闭</button>
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;justify-content:flex-end;">
                            <button id="start-recording-btn" style="background:#4CAF50;color:#fff;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;font-size:12px;">开始录制</button>
                            <button id="start-tab-capture-btn" style="background:#ff9800;color:#fff;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;font-size:12px;" title="整页录屏（加密/DRM 直播用）⚠️ 从扩展图标点更可靠，不会出现共享提示条">整页录屏</button>
                        </div>
                    </div>
                `;
                document.getElementById('start-recording-btn').onclick = () => this.startRecording();
                document.getElementById('start-tab-capture-btn').onclick = () => this.startTabCaptureRecording();
                document.getElementById('close-float-btn').onclick = () => this.removeRecordingFloat();
            }
        }

        async startTabCaptureRecording(preGotStreamId) {
            try {
                this.showToast('正在请求整页录屏权限（录屏时请保持页面在最前）', 4000);

                let stream = null;
                let sourceLabel = '';
                let lastErr = null;
                let finalStreamId = preGotStreamId || null;
                const fromPopup = !!preGotStreamId;

                // ── 方案 1：Chrome tabCapture（来自 popup 预先获取的 streamId，带扩展手势上下文） ──
                if (finalStreamId) {
                    console.log('[tabCapture] 使用 popup 提供的 streamId:', finalStreamId.slice(0, 10) + '...');
                } else {
                    // 浮动面板内点击触发的：向 background 请求 streamId（可能因缺少扩展手势而失败）
                    try {
                        const response = await new Promise((resolve, reject) => {
                            chrome.runtime.sendMessage({ type: 'start_tab_capture' }, (resp) => {
                                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                                else resolve(resp);
                            });
                        });
                        console.log('[tabCapture] background 返回：', response);
                        if (response && response.streamId) finalStreamId = response.streamId;
                    } catch (err) {
                        lastErr = err;
                        console.warn('[tabCapture] background 请求失败：', err);
                    }
                }

                if (finalStreamId) {
                    // ✅ tab capture：chromeMediaSource: 'tab' 必须在 mandatory 里，否则会用摄像头！
                    // 策略：先试 video+audio，失败则只试 video，然后单独用多种配置试 audio
                    const baseTabConfig = {
                        video: {
                            mandatory: {
                                chromeMediaSource: 'tab',
                                chromeMediaSourceId: finalStreamId,
                                maxWidth: 1920,
                                maxHeight: 1080,
                                maxFrameRate: 30
                            }
                        },
                        audio: {
                            mandatory: {
                                chromeMediaSource: 'tab',
                                chromeMediaSourceId: finalStreamId
                            }
                        }
                    };
                    const videoOnlyConfig = {
                        video: {
                            mandatory: {
                                chromeMediaSource: 'tab',
                                chromeMediaSourceId: finalStreamId,
                                maxWidth: 1920,
                                maxHeight: 1080,
                                maxFrameRate: 30
                            }
                        },
                        audio: false
                    };
                    const audioConfigVariants = [
                        { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: finalStreamId } },
                        { chromeMediaSource: 'tab', chromeMediaSourceId: finalStreamId },
                        true  // 兜底：用系统默认音频（麦克风/系统音频混合）
                    ];

                    try {
                        // 方案 A：一次获取 video+audio
                        stream = await navigator.mediaDevices.getUserMedia(baseTabConfig);
                        sourceLabel = 'tab';
                        console.log('[tabCapture] ✅ video+audio 一次获取成功');
                    } catch (err1) {
                        console.warn('[tabCapture] video+audio 一起失败，尝试分步捕获：', err1);
                        try {
                            // 方案 B：先只拿 video
                            stream = await navigator.mediaDevices.getUserMedia(videoOnlyConfig);
                            console.log('[tabCapture] ✅ video 捕获成功，尝试多种 audio 配置');

                            // 逐一尝试 audio 配置
                            let audioStream = null;
                            for (let i = 0; i < audioConfigVariants.length; i++) {
                                try {
                                    const v = audioConfigVariants[i];
                                    if (v === true) {
                                        // 兜底：系统麦克风（虽然不是 tab 音频，但总比没有好）
                                        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                                    } else {
                                        audioStream = await navigator.mediaDevices.getUserMedia({ audio: v, video: false });
                                    }
                                    console.log(`[tabCapture] ✅ audio 方案 ${i + 1} 成功`);
                                    break;
                                } catch (err2) {
                                    console.warn(`[tabCapture] audio 方案 ${i + 1} 失败：`, err2);
                                }
                            }

                            if (audioStream) {
                                // 把 audio track 加到原 stream 上
                                audioStream.getAudioTracks().forEach(t => stream.addTrack(t));
                            } else {
                                console.warn('[tabCapture] ⚠️ 所有 audio 方案都失败，只有视频没有声音');
                            }
                            sourceLabel = 'tab';
                        } catch (err3) {
                            lastErr = err3;
                            console.warn('[tabCapture] ❌ 分步捕获也失败：', err3);
                            stream = null;
                        }
                    }

                    // 检查：确保不是摄像头
                    if (stream) {
                        const videoTracks = stream.getVideoTracks();
                        if (videoTracks.length > 0) {
                            const label = videoTracks[0].label || '';
                            const isCamera = /camera|cam|webcam|video|integrated|usb/i.test(label);
                            if (isCamera || (label && label.length > 0 && !/tab|capture|screen/i.test(label))) {
                                console.warn('[tabCapture] ⚠️ 疑似摄像头！label:', label);
                                stream.getTracks().forEach(t => t.stop());
                                stream = null;
                                lastErr = new Error('捕获到的是摄像头而非标签页（label=' + label + '）');
                            } else {
                                console.log('[tabCapture] video track label:', label || '(空，正常)');
                            }
                        }
                    }
                }

                // ── 方案 2：Chrome getDisplayMedia + preferCurrentTab（默认选中当前标签页） ──
                if (!stream && fromPopup) {
                    throw new Error('整页录屏失败：请在 chrome://extensions 重新加载扩展，然后刷新当前页面重试');
                }
                if (!stream) {
                    this.showToast('正在尝试屏幕分享：请选择"当前标签页"并勾选"同时分享音频"', 6000);

                    const dmConfigs = [
                        // Chrome 107+：preferCurrentTab 让对话框默认选中当前标签页，systemAudio 强制包含 tab 音频
                        {
                            video: { displaySurface: 'browser' },
                            audio: true,
                            preferCurrentTab: true,
                            selfBrowserSurface: 'include',
                            surfaceSwitching: 'include',
                            systemAudio: 'include'
                        },
                        // 降级 1：只带 systemAudio
                        { video: true, audio: true, systemAudio: 'include' },
                        // 降级 2：最基础的 audio:true
                        { video: true, audio: true }
                    ];

                    for (let i = 0; i < dmConfigs.length; i++) {
                        try {
                            stream = await navigator.mediaDevices.getDisplayMedia(dmConfigs[i]);
                            sourceLabel = 'display';
                            console.log(`[getDisplayMedia] 配置 ${i + 1} 成功！video=${stream.getVideoTracks().length}, audio=${stream.getAudioTracks().length}`);
                            break;
                        } catch (err) {
                            lastErr = err;
                            console.warn(`[getDisplayMedia] 配置 ${i + 1} 失败：`, err);
                            stream = null;
                        }
                    }

                    if (!stream) {
                        throw new Error('屏幕分享未授权或被取消：' + (lastErr ? lastErr.message : '未知错误'));
                    }
                }

                if (!stream) {
                    throw new Error('无法获取页面视频流');
                }

                // 统一的音频/视频轨诊断（无论 tab capture 还是 getDisplayMedia）
                const videoTrackCount = stream.getVideoTracks().length;
                const audioTrackCount = stream.getAudioTracks().length;
                const hasAudio = audioTrackCount > 0;

                console.log(`[录制诊断] 视频轨=${videoTrackCount}, 音频轨=${audioTrackCount}`);
                if (videoTrackCount > 0) {
                    const vt = stream.getVideoTracks()[0];
                    console.log(`  video track: label="${vt.label}", enabled=${vt.enabled}, muted=${vt.muted}`, vt.getSettings ? vt.getSettings() : '');
                }
                if (audioTrackCount > 0) {
                    const at = stream.getAudioTracks()[0];
                    console.log(`  audio track: label="${at.label}", enabled=${at.enabled}, muted=${at.muted}`, at.getSettings ? at.getSettings() : '');
                }

                if (!hasAudio) {
                    const tip = sourceLabel === 'display'
                        ? '⚠ 提示：当前未包含音频！请在"分享屏幕"对话框中勾选"同时分享音频/标签页音频"（注意：只能在下次重试时生效）'
                        : '⚠ 提示：当前未捕获到音频！请确保页面正在播放声音，或改用"整页录屏"的屏幕分享方式（会有共享提示条）';
                    this.showToast(tip, 8000);
                } else {
                    this.showToast('✅ 开始录制（已含音频）', 3000);
                }

                // ── 与普通 video 捕获共用 MediaRecorder 逻辑 ──
                this.stream = stream;
                this._tabCaptureMode = true;
                this._tabCaptureSource = sourceLabel;
                this.isRecording = true;
                this.recordingStartTime = Date.now();
                this.chunks = [];
                this.segmentIndex = 1;
                this.lastSegmentTime = Date.now();

                this.createRecorder();
                this.setupBeforeUnload();
                this.updateFloatUI();
                this.safeSendMessage({ type: 'recording_started' });

                // 屏幕分享时，用户手动点击"停止分享"按钮也应当停止录制
                stream.getVideoTracks().forEach(track => {
                    track.addEventListener('ended', () => {
                        if (this.isRecording && this._tabCaptureMode) {
                            this.showToast('检测到分享已停止，正在保存视频…', 3000);
                            this.stopRecording();
                        }
                    });
                });
            } catch (error) {
                console.error('整页录屏启动失败：', error);
                this.showToast('整页录屏启动失败：' + error.message, 7000);
                this.isRecording = false;
                this._tabCaptureMode = false;
                if (this.stream) {
                    this.stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
                    this.stream = null;
                }
                this.updateFloatUI();
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
                if (this.isRecording) {
                    // 整页录屏 和 普通 video 捕获共用保存逻辑
                    if (this.chunks.length > 0) {
                        try { this.saveSegment(true); } catch (_) {}
                    }
                    if (this.recorder && this.recorder.state === 'recording') {
                        try { this.recorder.stop(); } catch (_) {}
                    }
                    if (this._tabCaptureMode && this.stream) {
                        try { this.stream.getTracks().forEach(t => t.stop()); } catch (_) {}
                    }
                    this.isRecording = false;
                    this._tabCaptureMode = false;
                    this.safeSendMessage({ type: 'recording_stopped' });
                }
            };
            window.addEventListener('beforeunload', this._beforeUnloadHandler);
        }

        cleanup() {
            this.recordingStartTime = 0;
            this.isRecording = false;
            this._tabCaptureMode = false;
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