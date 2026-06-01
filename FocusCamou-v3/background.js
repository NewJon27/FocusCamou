// 切换状态并更新图标
async function toggleEnabled() {
  const data = await chrome.storage.sync.get(['bypass_state']);
  const state = data.bypass_state || { enabled: true };
  state.enabled = !state.enabled;
  await chrome.storage.sync.set({ bypass_state: state });
  updateIcon(state.enabled);
  persistTabEnabledFlag(state.enabled).finally(() => {
    reloadActiveTab();
  });
}

async function getActiveHttpTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) return null;
  return tab;
}

async function persistTabEnabledFlag(enabled) {
  const tab = await getActiveHttpTab();
  if (!tab) return;
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (nextEnabled) => {
      try {
        sessionStorage.setItem('__focuscamou_enabled__', nextEnabled ? '1' : '0');
      } catch (e) {}
    },
    args: [enabled]
  });
}

async function reloadActiveTab() {
  const tab = await getActiveHttpTab();
  if (!tab) return;
  await chrome.tabs.reload(tab.id);
}

function updateIcon(enabled) {
  const suffix = enabled ? 'on' : 'off';
  chrome.action.setIcon({
    path: {
      16:  `icon_16_${suffix}.png`,
      32:  `icon_32_${suffix}.png`,
      48:  `icon_48_${suffix}.png`,
      128: `icon_128_${suffix}.png`
    }
  });
}

// 快捷键触发
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-bypass') {
    toggleEnabled();
  }
});

// storage 变化时同步图标（popup 里点击大按钮也会触发）
chrome.storage.onChanged.addListener((changes) => {
  if (changes.bypass_state) {
    const enabled = changes.bypass_state.newValue?.enabled ?? true;
    updateIcon(enabled);
  }
});

// 启动时恢复图标状态
chrome.storage.sync.get(['bypass_state'], (data) => {
  const enabled = data.bypass_state?.enabled ?? true;
  updateIcon(enabled);
});
