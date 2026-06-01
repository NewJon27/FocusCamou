const DEFAULT = {
  enabled: true,
  features: {
    visibility: { on: true, mode: 'block' },
    focus: { on: true, mode: 'block' },
    mouse: { on: true },
    network: { on: true },
    windowswitch: { on: true }
  }
};

let state = JSON.parse(JSON.stringify(DEFAULT));
let pendingRefresh = false;
let reloadTriggered = false;

function withActiveHttpTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) return;
    callback(tab);
  });
}

function persistTabEnabledFlag(enabled, done) {
  withActiveHttpTab((tab) => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (nextEnabled) => {
        try {
          sessionStorage.setItem('__focuscamou_enabled__', nextEnabled ? '1' : '0');
        } catch (e) {}
      },
      args: [enabled]
    }, () => done?.());
  });
}

function ensureStateShape() {
  state.features ||= {};
  state.features.visibility ||= { on: true, mode: 'block' };
  state.features.focus ||= { on: true, mode: 'block' };
  state.features.mouse ||= { on: true };
  state.features.network ||= { on: true };
  state.features.windowswitch ||= { on: true };

  // These two are always enabled; only mode is configurable.
  state.features.visibility.on = true;
  state.features.focus.on = true;
}

function load(cb) {
  chrome.storage.sync.get(['bypass_state'], (result) => {
    if (result.bypass_state) state = result.bypass_state;
    ensureStateShape();
    cb();
  });
}

function save() {
  ensureStateShape();
  chrome.storage.sync.set({ bypass_state: state });
}

function reloadActiveTab() {
  if (reloadTriggered) return;
  reloadTriggered = true;
  withActiveHttpTab((tab) => {
    chrome.tabs.reload(tab.id);
  });
}

function scheduleRefreshOnClose() {
  pendingRefresh = true;
}

function flushPendingRefresh() {
  if (!pendingRefresh || reloadTriggered) return;
  reloadActiveTab();
}

function render() {
  const btn = document.getElementById('mainBtn');
  const icon = document.getElementById('btnIcon');
  const label = document.getElementById('btnLabel');

  if (state.enabled) {
    btn.className = 'big-btn on';
    icon.textContent = '⏻';
    label.textContent = 'ON';
  } else {
    btn.className = 'big-btn off';
    icon.textContent = '⏻';
    label.textContent = 'OFF';
  }

  document.querySelectorAll('.feat-switch').forEach((sw) => {
    const feat = sw.dataset.feat;
    sw.className = 'feat-switch' + (state.features[feat]?.on ? ' on' : '');
  });

  document.querySelectorAll('.mode-btn').forEach((modeBtn) => {
    const feat = modeBtn.dataset.feat;
    const mode = modeBtn.dataset.mode;
    const activeMode = state.features[feat]?.mode;
    modeBtn.className = 'mode-btn' + (mode === activeMode ? ' active' : '');
  });

}

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.bypass_state) return;
  state = changes.bypass_state.newValue;
  ensureStateShape();
  render();
});

document.getElementById('mainBtn').addEventListener('click', () => {
  state.enabled = !state.enabled;
  save();
  render();
  persistTabEnabledFlag(state.enabled, reloadActiveTab);
});

document.querySelectorAll('.feat-switch').forEach((sw) => {
  sw.addEventListener('click', () => {
    const feat = sw.dataset.feat;
    state.features[feat].on = !state.features[feat].on;
    save();
    render();
    scheduleRefreshOnClose();
  });
});

document.querySelectorAll('.mode-btn').forEach((modeBtn) => {
  modeBtn.addEventListener('click', () => {
    const feat = modeBtn.dataset.feat;
    state.features[feat].mode = modeBtn.dataset.mode;
    if (feat === 'visibility' || feat === 'focus') {
      state.features[feat].on = true;
    }
    save();
    render();
    scheduleRefreshOnClose();
  });
});

window.addEventListener('pagehide', flushPendingRefresh);
window.addEventListener('blur', flushPendingRefresh);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    flushPendingRefresh();
  }
});

load(render);
