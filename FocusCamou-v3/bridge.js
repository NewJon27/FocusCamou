const DEFAULT_STATE = {
  enabled: true,
  features: {
    visibility: { on: true, mode: 'block' },
    focus: { on: true, mode: 'block' },
    mouse: { on: true },
    network: { on: true },
    windowswitch: { on: true }
  }
};

function normalizeState(state) {
  const next = state ? JSON.parse(JSON.stringify(state)) : JSON.parse(JSON.stringify(DEFAULT_STATE));

  next.features ||= {};
  next.features.visibility ||= { on: true, mode: 'block' };
  next.features.focus ||= { on: true, mode: 'block' };
  next.features.mouse ||= { on: true };
  next.features.network ||= { on: true };
  next.features.windowswitch ||= { on: true };

  next.features.visibility.on = true;
  next.features.focus.on = true;
  next.features.visibility.mode ||= 'block';
  next.features.focus.mode ||= 'block';
  next.enabled ??= true;

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
