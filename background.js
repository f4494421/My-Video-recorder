// 后台脚本：处理图标切换、消息通信、整页录屏
// MV3 中使用 chrome.tabCapture.getMediaStreamId()（旧的 capture() 已废弃）

const recordingTabs = new Set();

const recordIcons = {
    16: 'icon_record_16.png',
    32: 'icon_record_32.png',
    48: 'icon_record_48.png',
    128: 'icon_record_128.png'
};
const stopIcons = {
    16: 'icon_stop_16.png',
    32: 'icon_stop_32.png',
    48: 'icon_stop_48.png',
    128: 'icon_stop_128.png'
};

const setAction = (tabId, isRecording) => {
    chrome.action.setIcon({
        tabId,
        path: isRecording ? stopIcons : recordIcons
    });
    chrome.action.setTitle({
        tabId,
        title: isRecording ? '停止录屏' : '录屏'
    });
};

// 监听 content.js 与 popup.js 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // ── popup 点击开始录制：注入 content.js 并显示浮动窗 ──
    if (message.type === 'start_record_on_tab' && message.tabId) {
        chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            files: ['content.js']
        }, results => {
            if (chrome.runtime.lastError) {
                console.error('注入 content.js 失败:', chrome.runtime.lastError.message);
                return;
            }
            chrome.scripting.executeScript({
                target: { tabId: message.tabId },
                func: () => window.videoRecorder && window.videoRecorder.showRecordingFloat()
            }, results => {
                if (chrome.runtime.lastError) {
                    console.error('显示录制窗口失败:', chrome.runtime.lastError.message);
                }
            });
        });
    }

    // ── tabCapture 整页录屏：获取 streamId，交给 content script 消费 ──
    if (message.type === 'start_tab_capture') {
        const tabId = sender.tab && sender.tab.id;
        if (!tabId) {
            sendResponse({ error: '无法获取 tabId' });
            return true;
        }
        try {
            // MV3 正确 API：getMediaStreamId
            if (typeof chrome.tabCapture?.getMediaStreamId === 'function') {
                chrome.tabCapture.getMediaStreamId({
                    consumerTabId: tabId,
                    targetTabId: tabId
                }, (streamId) => {
                    if (chrome.runtime.lastError) {
                        console.error('getMediaStreamId 失败：', chrome.runtime.lastError.message);
                        sendResponse({ error: chrome.runtime.lastError.message, fallback: true });
                    } else if (!streamId) {
                        sendResponse({ error: '未获取到 streamId', fallback: true });
                    } else {
                        sendResponse({ success: true, streamId });
                    }
                });
            } else {
                // getMediaStreamId 也不可用，让 content script 回退到 getDisplayMedia
                sendResponse({ error: '当前浏览器不支持 tabCapture API', fallback: true });
            }
        } catch (err) {
            console.error('tabCapture 出错：', err);
            sendResponse({ error: err.message, fallback: true });
        }
        return true; // 异步响应
    }

    // ── 常规录制状态标记 ──
    if (message.type === 'recording_started' && sender.tab && sender.tab.id) {
        recordingTabs.add(sender.tab.id);
        setAction(sender.tab.id, true);
    }
    if (message.type === 'recording_stopped' && sender.tab && sender.tab.id) {
        recordingTabs.delete(sender.tab.id);
        setAction(sender.tab.id, false);
    }
});

chrome.runtime.onInstalled.addListener(() => {
    // 可选：初始化其它本地存储
});

// 页面刷新/关闭时，重置录制状态
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && recordingTabs.has(tabId)) {
        recordingTabs.delete(tabId);
        setAction(tabId, false);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    recordingTabs.delete(tabId);
});