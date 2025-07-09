let injectedTabs = {};

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
        }, () => {
            chrome.scripting.executeScript({
                target: { tabId: message.tabId },
                func: () => window.startMyRecorder && window.startMyRecorder()
            });
        });
    }
    if (message.type === 'recorder_started' && sender.tab && sender.tab.id) {
        setAction(sender.tab.id, false); // 立刻切换为正方形
    }
    if (message.type === 'check_update') {
        checkForUpdates();
    }
});

// 版本检查和升级提示
const CURRENT_VERSION = '1.0.0';
const UPDATE_CHECK_URL = 'https://api.github.com/repos/your-username/your-repo/releases/latest';

function checkForUpdates() {
    fetch(UPDATE_CHECK_URL)
        .then(response => response.json())
        .then(data => {
            const latestVersion = data.tag_name.replace('v', '');
            if (latestVersion !== CURRENT_VERSION) {
                showUpdateNotification(latestVersion, data.html_url);
            }
        })
        .catch(error => {
            console.log('版本检查失败:', error);
        });
}

function showUpdateNotification(version, downloadUrl) {
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