// 获取所有标签页，筛选含有<video>的页面
chrome.tabs.query({}, (tabs) => {
    const checkPromises = tabs.map(tab => new Promise(resolve => {
        // 只处理 http(s)/file 协议的页面
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
                console.log('无法访问标签页:', tab.url, chrome.runtime.lastError.message);
                resolve({ tab, hasVideo: false });
                return;
            }
            resolve({ tab, hasVideo: results && results[0] && results[0].result.hasVideo });
        });
    }));
    Promise.all(checkPromises).then(results => {
        const videoTabs = results.filter(r => r.hasVideo);
        const tabList = document.getElementById('tabList');
        videoTabs.forEach(({ tab }) => {
            const li = document.createElement('li');
            li.className = 'tab-item';
            li.innerHTML = `<div class="tab-title">${tab.title}</div>`;
            li.onclick = () => {
                chrome.runtime.sendMessage({ type: 'start_record_on_tab', tabId: tab.id });
                window.close();
            };
            tabList.appendChild(li);
        });
    });
});

// 录制当前标签页按钮
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
