// Tab Manager Popup Script

class PopupManager {
  constructor() {
    this.maxTabsInput = document.getElementById('maxTabs');
    this.strategySelect = document.getElementById('strategy');
    this.saveBtn = document.getElementById('saveBtn');
    this.manualCheckBtn = document.getElementById('manualCheckBtn');
    this.currentTabCountSpan = document.getElementById('currentTabCount');
    this.statusSpan = document.getElementById('status');
    
    this.init();
  }

  async init() {
    // 加载当前设置
    await this.loadSettings();
    
    // 更新标签页计数
    await this.updateTabCount();
    
    // 绑定事件监听器
    this.bindEvents();
  }

  async loadSettings() {
    try {
      const response = await this.sendMessage({ action: 'getSettings' });
      this.maxTabsInput.value = response.maxTabs;
      this.strategySelect.value = response.strategy;
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showToast('加载设置失败', 'error');
    }
  }

  async updateTabCount() {
    try {
      const tabs = await chrome.tabs.query({});
      const count = tabs.length;
      this.currentTabCountSpan.textContent = count;
      
      // 更新状态
      const maxTabs = parseInt(this.maxTabsInput.value);
      if (count > maxTabs) {
        this.statusSpan.textContent = `超出 ${count - maxTabs} 个`;
        this.statusSpan.className = 'value status-danger';
      } else if (count === maxTabs) {
        this.statusSpan.textContent = '已达上限';
        this.statusSpan.className = 'value status-warning';
      } else {
        this.statusSpan.textContent = '正常';
        this.statusSpan.className = 'value status-normal';
      }
    } catch (error) {
      console.error('Failed to update tab count:', error);
      this.currentTabCountSpan.textContent = '错误';
    }
  }

  bindEvents() {
    // 保存设置按钮
    this.saveBtn.addEventListener('click', () => this.saveSettings());
    
    // 立即检查按钮
    this.manualCheckBtn.addEventListener('click', () => this.manualCheck());
    
    // 输入变化时更新状态
    this.maxTabsInput.addEventListener('input', () => this.updateTabCount());
    
    // 策略选择变化时的提示
    this.strategySelect.addEventListener('change', () => {
      this.showStrategyInfo();
    });
  }

  async saveSettings() {
    const maxTabs = parseInt(this.maxTabsInput.value);
    const strategy = this.strategySelect.value;
    
    // 验证输入
    if (isNaN(maxTabs) || maxTabs < 1 || maxTabs > 100) {
      this.showToast('请输入有效的标签页数量 (1-100)', 'error');
      return;
    }
    
    try {
      this.saveBtn.disabled = true;
      this.saveBtn.textContent = '保存中...';
      
      const response = await this.sendMessage({
        action: 'updateSettings',
        maxTabs: maxTabs,
        strategy: strategy
      });
      
      if (response.success) {
        this.showToast('设置已保存', 'success');
        await this.updateTabCount();
      } else {
        throw new Error(response.error || '保存失败');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showToast('保存设置失败', 'error');
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.textContent = '保存设置';
    }
  }

  async manualCheck() {
    try {
      this.manualCheckBtn.disabled = true;
      this.manualCheckBtn.textContent = '检查中...';
      
      const response = await this.sendMessage({ action: 'manualCheck' });
      
      if (response.success) {
        this.showToast('检查完成', 'success');
        // 延迟更新计数，给标签页关闭一些时间
        setTimeout(() => this.updateTabCount(), 500);
      } else {
        throw new Error(response.error || '检查失败');
      }
    } catch (error) {
      console.error('Manual check failed:', error);
      this.showToast('检查失败', 'error');
    } finally {
      this.manualCheckBtn.disabled = false;
      this.manualCheckBtn.textContent = '立即检查';
    }
  }

  showStrategyInfo() {
    const strategy = this.strategySelect.value;
    const messages = {
      'oldest': '将关闭最早打开的标签页',
      'newest': '将关闭最近打开的标签页',
      'least_used': '将关闭使用频率最低的标签页',
      'duplicate': '将优先关闭重复的标签页'
    };
    
    if (messages[strategy]) {
      this.showToast(messages[strategy], 'success');
    }
  }

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  showToast(message, type = 'success') {
    // 移除现有的toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }
    
    // 创建新的toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // 3秒后自动移除
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 3000);
  }

  // 格式化数字显示
  formatNumber(num) {
    return num.toLocaleString('zh-CN');
  }

  // 获取策略的中文描述
  getStrategyDescription(strategy) {
    const descriptions = {
      'oldest': '最旧优先',
      'newest': '最新优先', 
      'least_used': '最少使用',
      'duplicate': '重复优先'
    };
    return descriptions[strategy] || strategy;
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});

// 监听标签页变化，实时更新计数
chrome.tabs.onCreated.addListener(() => {
  // 延迟更新，确保标签页已完全创建
  setTimeout(() => {
    const popupManager = window.popupManager;
    if (popupManager) {
      popupManager.updateTabCount();
    }
  }, 100);
});

chrome.tabs.onRemoved.addListener(() => {
  setTimeout(() => {
    const popupManager = window.popupManager;
    if (popupManager) {
      popupManager.updateTabCount();
    }
  }, 100);
});

// 导出PopupManager以便在其他地方使用
window.popupManager = null;
document.addEventListener('DOMContentLoaded', () => {
  window.popupManager = new PopupManager();
});