// Tab Manager Background Script

class TabManager {
  constructor() {
    this.maxTabs = 10; // 默认最大标签页数量
    this.strategy = 'oldest'; // 默认策略：关闭最旧的标签页
    this.init();
  }

  async init() {
    // 从存储中加载设置
    const result = await chrome.storage.sync.get(['maxTabs', 'strategy']);
    this.maxTabs = result.maxTabs || 10;
    this.strategy = result.strategy || 'oldest';

    // 监听标签页创建事件
    chrome.tabs.onCreated.addListener(() => {
      this.checkAndManageTabs();
    });

    // 监听标签页更新事件
    chrome.tabs.onUpdated.addListener(() => {
      this.checkAndManageTabs();
    });
  }

  async checkAndManageTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      
      if (tabs.length > this.maxTabs) {
        const tabsToClose = tabs.length - this.maxTabs;
        await this.closeTabs(tabs, tabsToClose);
      }
    } catch (error) {
      console.error('Tab management error:', error);
    }
  }

  async closeTabs(tabs, count) {
    let tabsToClose = [];

    switch (this.strategy) {
      case 'oldest':
        // 按创建时间排序，关闭最旧的标签页
        tabsToClose = tabs
          .filter(tab => !tab.pinned && !tab.active) // 不关闭固定和当前活动的标签页
          .sort((a, b) => a.id - b.id)
          .slice(0, count);
        break;

      case 'newest':
        // 关闭最新的标签页
        tabsToClose = tabs
          .filter(tab => !tab.pinned && !tab.active)
          .sort((a, b) => b.id - a.id)
          .slice(0, count);
        break;

      case 'least_used':
        // 关闭最少使用的标签页（基于URL访问频率）
        const urlCounts = await this.getUrlAccessCounts();
        tabsToClose = tabs
          .filter(tab => !tab.pinned && !tab.active)
          .sort((a, b) => (urlCounts[a.url] || 0) - (urlCounts[b.url] || 0))
          .slice(0, count);
        break;

      case 'duplicate':
        // 优先关闭重复的标签页
        const urlMap = new Map();
        tabs.forEach(tab => {
          if (!tab.pinned && !tab.active) {
            if (urlMap.has(tab.url)) {
              urlMap.get(tab.url).push(tab);
            } else {
              urlMap.set(tab.url, [tab]);
            }
          }
        });
        
        // 收集重复的标签页
        for (const [url, duplicateTabs] of urlMap) {
          if (duplicateTabs.length > 1 && tabsToClose.length < count) {
            // 保留最新的，关闭其他的
            const sortedDuplicates = duplicateTabs.sort((a, b) => b.id - a.id);
            tabsToClose.push(...sortedDuplicates.slice(1, count - tabsToClose.length + 1));
          }
        }
        
        // 如果重复标签页不够，按最旧策略补充
        if (tabsToClose.length < count) {
          const remaining = tabs
            .filter(tab => !tab.pinned && !tab.active && !tabsToClose.includes(tab))
            .sort((a, b) => a.id - b.id)
            .slice(0, count - tabsToClose.length);
          tabsToClose.push(...remaining);
        }
        break;
    }

    // 关闭选中的标签页
    for (const tab of tabsToClose) {
      try {
        await chrome.tabs.remove(tab.id);
        console.log(`Closed tab: ${tab.title} (${tab.url})`);
      } catch (error) {
        console.error(`Failed to close tab ${tab.id}:`, error);
      }
    }
  }

  async getUrlAccessCounts() {
    // 从存储中获取URL访问计数
    const result = await chrome.storage.local.get(['urlCounts']);
    return result.urlCounts || {};
  }

  async updateUrlAccessCount(url) {
    const result = await chrome.storage.local.get(['urlCounts']);
    const urlCounts = result.urlCounts || {};
    urlCounts[url] = (urlCounts[url] || 0) + 1;
    await chrome.storage.local.set({ urlCounts });
  }

  async updateSettings(maxTabs, strategy) {
    this.maxTabs = maxTabs;
    this.strategy = strategy;
    await chrome.storage.sync.set({ maxTabs, strategy });
  }
}

// 初始化Tab Manager
const tabManager = new TabManager();

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateSettings') {
    tabManager.updateSettings(request.maxTabs, request.strategy)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'getSettings') {
    sendResponse({
      maxTabs: tabManager.maxTabs,
      strategy: tabManager.strategy
    });
  }
  
  if (request.action === 'manualCheck') {
    tabManager.checkAndManageTabs()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// 监听标签页激活事件，用于统计使用频率
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && !tab.url.startsWith('chrome://')) {
      await tabManager.updateUrlAccessCount(tab.url);
    }
  } catch (error) {
    console.error('Error updating URL access count:', error);
  }
});