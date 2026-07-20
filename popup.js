const MAX_TABS_TO_SCAN = 50;

const tabList = document.getElementById('tabList');
if (tabList) {
    tabList.innerHTML = '<li class="tab-item" style="cursor:default;color:#888;">正在扫描标签页...</li>';
}

chrome.tabs.query({ currentWindow: true }, (tabs) => {
    const tabsToScan = tabs.slice(0, MAX_TABS_TO_SCAN);

    const checkPromises = tabsToScan.map(tab => new Promise(resolve => {
        if (!/^https?:|^file:/.test(tab.url)) {
            resolve({ tab, hasVideo: false });
            return;
        }
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const video = document.querySelector('video');
                return video ? { hasVideo: true } : { hasVideo: false };
            }
        }, (results) => {
            if (chrome.runtime.lastError) {
                resolve({ tab, hasVideo: false });
                return;
            }
            resolve({ tab, hasVideo: results && results[0] && results[0].result.hasVideo });
        });
    }));

    Promise.all(checkPromises).then(results => {
        const videoTabs = results.filter(r => r.hasVideo);
        const listEl = document.getElementById('tabList');
        if (!listEl) return;
        listEl.innerHTML = '';

        if (videoTabs.length === 0) {
            const li = document.createElement('li');
            li.className = 'tab-item';
            li.style.cursor = 'default';
            li.style.color = '#888';
            li.textContent = '未检测到含有视频的标签页';
            listEl.appendChild(li);
            return;
        }

        videoTabs.forEach(({ tab }) => {
            const li = document.createElement('li');
            li.className = 'tab-item';
            li.innerHTML = `<div class="tab-title">${escapeHtml(tab.title)}</div>`;
            li.onclick = () => {
                chrome.runtime.sendMessage({ type: 'start_record_on_tab', tabId: tab.id });
                window.close();
            };
            listEl.appendChild(li);
        });
    });
});

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

const recordCurrentTabBtn = document.getElementById('recordCurrentTab');
if (recordCurrentTabBtn) {
    recordCurrentTabBtn.onclick = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0]) {
                chrome.runtime.sendMessage({ type: 'start_record_on_tab', tabId: tabs[0].id });
                window.close();
            }
        });
    };
}

/**
 * 整页录屏（从 popup 触发，拥有扩展用户手势，tabCapture 方案可工作）
 * 先在目标标签页注入 content.js 并显示浮动面板，然后把 streamId 传过去
 */
const recordWholePageBtn = document.getElementById('recordWholePage');
if (recordWholePageBtn) {
    recordWholePageBtn.onclick = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || !tabs[0]) return;
            const targetTabId = tabs[0].id;
            // 先注入 content.js 并显示浮动面板，再由 popup 直接调用 tabCapture 把 streamId 交给 content script
            chrome.scripting.executeScript({
                target: { tabId: targetTabId },
                files: ['content.js']
            }, () => {
                // 显示浮动面板
                chrome.scripting.executeScript({
                    target: { tabId: targetTabId },
                    func: () => window.videoRecorder && window.videoRecorder.showRecordingFloat()
                }, () => {
                    // ✅ 从 popup（带扩展用户手势）调用 tabCapture 获取 streamId
                    // —— 只会用 tabCapture，绝不对接 getDisplayMedia，避免出现共享提示条
                    chrome.tabCapture.getMediaStreamId(
                        { consumerTabId: targetTabId, targetTabId: targetTabId },
                        (streamId) => {
                            if (chrome.runtime.lastError || !streamId) {
                                // tabCapture 失败：不回退到 getDisplayMedia（会出现共享提示条）
                                // 直接在页面显示明确的错误信息
                                chrome.scripting.executeScript({
                                    target: { tabId: targetTabId },
                                    func: () => {
                                        if (window.videoRecorder) {
                                            window.videoRecorder.showToast('整页录屏未授权，请刷新页面后从扩展图标点击"整页录屏"重试', 8000);
                                        }
                                    }
                                });
                                return;
                            }
                            // ✅ 拿到有效 streamId —— 交给 content script，用 getUserMedia 消费（无共享提示条）
                            chrome.scripting.executeScript({
                                target: { tabId: targetTabId },
                                func: (id) => window.videoRecorder && window.videoRecorder.startTabCaptureRecording(id),
                                args: [streamId]
                            });
                        }
                    );
                });
            });
            window.close();
        });
    };
}