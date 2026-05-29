// 后台脚本：处理图标切换和消息通信

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

/**
 * 设置扩展图标和标题
 * @param {number} tabId
 * @param {boolean} isRecording
 */
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

// 监听 popup.js 的消息，指定 tabId 开始录屏
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'start_record_on_tab' && message.tabId) {
        chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            files: ['content.js']
        }, results => {
            if (chrome.runtime.lastError) {
                console.error('注入 content.js 失败:', chrome.runtime.lastError.message);
                return;
            }
            // 只显示悬浮窗，不自动开始录制
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
    if (message.type === 'recording_started' && sender.tab && sender.tab.id) {
        setAction(sender.tab.id, true);
    }
    if (message.type === 'recording_stopped' && sender.tab && sender.tab.id) {
        setAction(sender.tab.id, false);
    }
});

chrome.runtime.onInstalled.addListener(() => {
    // 可选：初始化其它本地存储
});