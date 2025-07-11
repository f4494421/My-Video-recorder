let injectedTabs = {};

// 定义版本和API URL常量
const CURRENT_VERSION = '2.1.0';
const GITEE_API_URL = 'https://gitee.com/api/v5/repos/mishimengzhong/codeleaner/releases/latest';
const GITEE_RELEASES_URL = 'https://gitee.com/mishimengzhong/codeleaner/releases';

const recordIcons = {
    16: "icon_record_16.png",
    32: "icon_record_32.png",
    48: "icon_record_48.png",
    128: "icon_record_128.png"
};
const stopIcons = {
    16: "icon_stop_16.png",
    32: "icon_stop_32.png",
    48: "icon_stop_48.png",
    128: "icon_stop_128.png"
};

function setAction(tabId, isRecording) {
    chrome.action.setIcon({
        tabId,
        path: isRecording ? recordIcons : stopIcons
    });
    chrome.action.setTitle({
        tabId,
        title: isRecording ? "停止录屏" : "录屏"
    });
}

// 监听 popup.js 的消息，指定 tabId 开始录屏
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'start_record_on_tab' && message.tabId) {
        chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            files: ['content.js']
        }, (results) => {
            // 添加错误处理
            if (chrome.runtime.lastError) {
                console.error('注入 content.js 失败:', chrome.runtime.lastError.message);
                return;
            }
            // 启动分段录制
            chrome.scripting.executeScript({
                target: { tabId: message.tabId },
                func: () => window.startSegmentRecording && window.startSegmentRecording()
            }, (results) => {
                if (chrome.runtime.lastError) {
                    console.error('启动分段录制失败:', chrome.runtime.lastError.message);
                }
            });
        });
    }
    if (message.type === 'recorder_started' && sender.tab && sender.tab.id) {
        setAction(sender.tab.id, false); // 立刻切换为正方形
    }
    if (message.type === 'check_update') {
        checkForUpdates();
    }
    // 新增：处理分段录制相关消息
    if (message.type === 'segment_recording_started' && sender.tab && sender.tab.id) {
        setAction(sender.tab.id, false); // 分段录制开始，切换为正方形
    }
    if (message.type === 'segment_recording_stopped' && sender.tab && sender.tab.id) {
        setAction(sender.tab.id, true); // 分段录制停止，切换为圆形
    }
});

// 添加版本存储和检测
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({
        version: CURRENT_VERSION,
        lastCheck: Date.now()
    });
});

// 修改升级检测函数
function checkForUpdates() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    chrome.storage.local.get(['lastCheck'], (result) => {
        if (!result.lastCheck || (now - result.lastCheck) > oneDay) {
            // 执行升级检测
            fetch(GITEE_API_URL)
                .then(response => response.json())
                .then(data => {
                    if (data && data.tag_name) {
                        const latestVersion = data.tag_name.replace('v', '');
                        if (latestVersion !== CURRENT_VERSION) {
                            showUpdateNotification(latestVersion, data.html_url, data.body);
                        }
                    }
                    // 更新检查时间
                    chrome.storage.local.set({ lastCheck: now });
                })
                .catch(error => {
                    console.log('版本检查失败:', error);
                });
        }
    });
}

function showUpdateNotification(version, downloadUrl, releaseNotes) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon_record_48.png',
        title: 'My Video Recorder 有新版本',
        message: `发现新版本 v${version}，点击查看更新内容`,
        requireInteraction: true
    }, (notificationId) => {
        // 点击通知时打开下载页面
        chrome.notifications.onClicked.addListener((id) => {
            if (id === notificationId) {
                chrome.tabs.create({ url: downloadUrl });
            }
        });
    });
}

// 每24小时检查一次更新
setInterval(checkForUpdates, 24 * 60 * 60 * 1000);
// 启动时检查一次
checkForUpdates();