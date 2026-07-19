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