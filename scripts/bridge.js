const DEFAULT_STATE = {
  enabled: false,
  features: {
    visibility: { on: true, mode: 'block' },
    focus: { on: true, mode: 'block' },
    mouse: { on: false },
    network: { on: false },
    windowswitch: { on: false }
  }
};

function normalizeState(state) {
  const next = state ? JSON.parse(JSON.stringify(state)) : JSON.parse(JSON.stringify(DEFAULT_STATE));

  next.features ||= {};
  next.features.visibility ||= { on: true, mode: 'block' };
  next.features.focus ||= { on: true, mode: 'block' };
  next.features.mouse ||= { on: false };
  next.features.network ||= { on: false };
  next.features.windowswitch ||= { on: false };

  next.features.visibility.on = true;
  next.features.focus.on = true;
  next.features.visibility.mode ||= 'block';
  next.features.focus.mode ||= 'block';
  next.enabled ??= false;

  return next;
}

function sendState(state) {
  window.dispatchEvent(new CustomEvent('__focuscamou_state__', {
    detail: { state: normalizeState(state) }
  }));
}

function sendBootstrap(state) {
  window.dispatchEvent(new CustomEvent('__focuscamou_bootstrap__', {
    detail: { state: normalizeState(state) }
  }));
}

window.addEventListener('__focuscamou_getstate__', () => {
  chrome.storage.sync.get(['bypass_state'], (result) => {
    sendState(result.bypass_state);
  });
});

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.bypass_state) return;
  sendState(changes.bypass_state.newValue);
});

chrome.storage.sync.get(['bypass_state'], (result) => {
  sendBootstrap(result.bypass_state);
  setTimeout(() => sendState(result.bypass_state), 5);
  setTimeout(() => sendState(result.bypass_state), 50);
});
