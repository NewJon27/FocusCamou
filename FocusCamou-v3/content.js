(() => {
  const _ael = EventTarget.prototype.addEventListener;
  const _fetch = window.fetch;
  const _xhrOpen = XMLHttpRequest.prototype.open;
  const _xhrSend = XMLHttpRequest.prototype.send;
  const noop = () => {};

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

  let installed = false;
  let mouseScheduleTimer = null;
  let bootstrapped = false;

  function normalizeState(state) {
    const next = state ? JSON.parse(JSON.stringify(state)) : JSON.parse(JSON.stringify(DEFAULT_STATE));

    next.features ||= {};
    next.features.visibility ||= { on: true, mode: 'block' };
    next.features.focus ||= { on: true, mode: 'block' };
    next.features.mouse ||= { on: true };
    next.features.network ||= { on: true };
    next.features.windowswitch ||= { on: true };

    next.enabled ??= true;
    next.features.visibility.on = true;
    next.features.focus.on = true;
    next.features.visibility.mode ||= 'block';
    next.features.focus.mode ||= 'block';

    return next;
  }

  function applyVisibleState() {
    try {
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible', configurable: true });
    } catch (e) {}
  }

  function patchWindowSwitchClass(cls, visibilityMode, focusMode) {
    if (!cls?.prototype) return;
    if (cls.prototype.__focusCamouPatched) return;

    try {
      if (visibilityMode === 'block' && focusMode === 'block') {
        cls.prototype.addEventListener = noop;
        cls.prototype.addEventListenerAll = noop;
      } else {
        const origOne = cls.prototype.addEventListener;
        const origAll = cls.prototype.addEventListenerAll;

        if (origOne) {
          cls.prototype.addEventListener = function(type, fn, ...rest) {
            if (type === 'hidden' || type === 'show' || type === 'visible') {
              return origOne.call(this, type, function(status, count) {
                if (status === 'hidden' || status === 'show' || status === 'visible') return;
                if (typeof fn === 'function') {
                  return fn.call(this, status, count);
                }
                return fn?.handleEvent?.call(fn, status, count);
              }, ...rest);
            }
            return origOne.call(this, type, fn, ...rest);
          };
        }

        if (origAll) {
          cls.prototype.addEventListenerAll = function(fn, ...rest) {
            return origAll.call(this, function(status, count) {
              if (status === 'hidden' || status === 'show' || status === 'visible') return;
              if (typeof fn === 'function') {
                return fn.call(this, status, count);
              }
              return fn?.handleEvent?.call(fn, status, count);
            }, ...rest);
          };
        }
      }

      cls.prototype.__focusCamouPatched = true;
    } catch (e) {}
  }

  function patchWindowSwitchInstance(instance, visibilityMode, focusMode) {
    if (!instance) return;

    try {
      if (visibilityMode === 'block' && focusMode === 'block') {
        instance.removeEventListenerAll?.();
        instance.addEventListener = noop;
        instance.addEventListenerAll = noop;
      } else {
        instance.remove = false;
        instance.blur = false;
        instance.focus = true;
      }
    } catch (e) {}
  }

  function bootstrapWindowSwitch(state) {
    if (bootstrapped) return;
    bootstrapped = true;

    const visibilityMode = state?.features?.visibility?.mode || 'spoof';
    const focusMode = state?.features?.focus?.mode || 'spoof';

    patchWindowSwitchClass(window.WindowSwitch, visibilityMode, focusMode);
    patchWindowSwitchInstance(window.windowSwitch, visibilityMode, focusMode);

    try {
      let currentClass = window.WindowSwitch;
      Object.defineProperty(window, 'WindowSwitch', {
        get() {
          return currentClass;
        },
        set(cls) {
          currentClass = cls;
          patchWindowSwitchClass(cls, visibilityMode, focusMode);
          Object.defineProperty(window, 'WindowSwitch', { value: cls, writable: true, configurable: true });
        },
        configurable: true
      });
    } catch (e) {}

    try {
      let currentInstance = window.windowSwitch;
      Object.defineProperty(window, 'windowSwitch', {
        get() {
          return currentInstance;
        },
        set(instance) {
          currentInstance = instance;
          patchWindowSwitchInstance(instance, visibilityMode, focusMode);
          Object.defineProperty(window, 'windowSwitch', { value: instance, writable: true, configurable: true });
        },
        configurable: true
      });
    } catch (e) {}
  }

  function install(config) {
    if (installed) return;
    installed = true;

    const state = normalizeState(config);
    const visibilityMode = state.features.visibility.mode;
    const focusMode = state.features.focus.mode;
    const networkOn = !!state.features.network.on;
    const mouseOn = !!state.features.mouse.on;
    const windowSwitchOn = !!state.features.windowswitch.on;

    applyVisibleState();
    document.hasFocus = () => true;

    if (focusMode === 'spoof') {
      ['onblur', 'onfocus', 'onvisibilitychange'].forEach((prop) => {
        try {
          Object.defineProperty(window, prop, { set: noop, get: () => noop, configurable: true });
        } catch (e) {}
      });

      try {
        Object.defineProperty(document, 'onvisibilitychange', { set: noop, get: () => noop, configurable: true });
      } catch (e) {}

      window.onblur = null;
      document.onvisibilitychange = null;
    }

    EventTarget.prototype.addEventListener = function(type, fn, opts) {
      if (this === window || this === document) {
        const isVisibilityEvent = type === 'visibilitychange' || type === 'webkitvisibilitychange';
        const isFocusEvent = type === 'blur' || type === 'focus';

        if (isVisibilityEvent && visibilityMode === 'block') {
          return;
        }

        if (type === 'blur' && focusMode === 'block') {
          return;
        }

        if (type === 'focus' && focusMode === 'block') {
          return;
        }

        if (isVisibilityEvent && visibilityMode === 'spoof') {
          return _ael.call(this, type, function() {
            applyVisibleState();
            if (typeof fn === 'function') {
              return fn.apply(this, arguments);
            }
            return fn?.handleEvent?.apply(fn, arguments);
          }, opts);
        }

        if (type === 'blur' && focusMode === 'spoof') {
          return _ael.call(this, type, function() {
            setTimeout(() => window.dispatchEvent(new FocusEvent('focus')), 10);
          }, opts);
        }

        if ((type === 'mouseleave' || type === 'mouseout') && focusMode === 'block') {
          return;
        }
      }

      return _ael.call(this, type, fn, opts);
    };

    EventTarget.prototype.addEventListener.toString = () => 'function addEventListener() { [native code] }';

    if (windowSwitchOn) {
      patchWindowSwitchClass(window.WindowSwitch, visibilityMode, focusMode);
      patchWindowSwitchInstance(window.windowSwitch, visibilityMode, focusMode);

      Object.defineProperty(window, 'WindowSwitch', {
        set(cls) {
          try {
            patchWindowSwitchClass(cls, visibilityMode, focusMode);
          } catch (e) {}

          Object.defineProperty(window, 'WindowSwitch', { value: cls, writable: true });
        },
        configurable: true
      });

      Object.defineProperty(window, 'windowSwitch', {
        set(instance) {
          try {
            patchWindowSwitchInstance(instance, visibilityMode, focusMode);
          } catch (e) {}

          Object.defineProperty(window, 'windowSwitch', { value: instance, writable: true });
        },
        configurable: true
      });
    }

    if (networkOn) {
      window.fetch = function(input, init) {
        const url = typeof input === 'string' ? input : (input?.url ?? '');
        if (/\/rrweb\/|hiddenVisible/.test(url)) {
          return Promise.resolve(new Response('{}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }));
        }
        return _fetch.apply(this, arguments);
      };
      window.fetch.toString = () => 'function fetch() { [native code] }';

      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._bypassed = /\/rrweb\/|hiddenVisible/.test(url);
        return _xhrOpen.call(this, method, url, ...rest);
      };

      XMLHttpRequest.prototype.send = function(body) {
        if (this._bypassed) {
          setTimeout(() => {
            Object.defineProperty(this, 'status', { get: () => 200 });
            Object.defineProperty(this, 'readyState', { get: () => 4 });
            Object.defineProperty(this, 'responseText', { get: () => '{}' });
            this.dispatchEvent(new Event('load'));
          }, 10);
          return;
        }

        return _xhrSend.call(this, body);
      };
    }

    if (mouseOn) {
      startMouse();
    }

  }

  function startMouse() {
    function move() {
      const toX = Math.random() * window.innerWidth;
      const toY = Math.random() * window.innerHeight;
      const fromX = move._x ?? window.innerWidth / 2;
      const fromY = move._y ?? window.innerHeight / 2;
      const cp1x = fromX + (Math.random() - 0.5) * 200;
      const cp1y = fromY + (Math.random() - 0.5) * 200;
      const cp2x = toX + (Math.random() - 0.5) * 200;
      const cp2y = toY + (Math.random() - 0.5) * 200;
      const steps = 20 + Math.floor(Math.random() * 20);
      const duration = 400 + Math.random() * 400;
      let step = 0;

      const timer = setInterval(() => {
        if (!installed) {
          clearInterval(timer);
          return;
        }

        step++;
        const r = step / steps;
        const u = 1 - r;
        const x = u * u * u * fromX + 3 * u * u * r * cp1x + 3 * u * r * r * cp2x + r * r * r * toX;
        const y = u * u * u * fromY + 3 * u * u * r * cp1y + 3 * u * r * r * cp2y + r * r * r * toY;

        document.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          clientX: Math.round(x),
          clientY: Math.round(y)
        }));

        if (step >= steps) {
          clearInterval(timer);
          move._x = toX;
          move._y = toY;
        }
      }, duration / steps);
    }

    function schedule() {
      mouseScheduleTimer = setTimeout(() => {
        if (!installed) return;
        move();
        schedule();
      }, 5000 + Math.random() * 5000);
    }

    clearTimeout(mouseScheduleTimer);
    schedule();
  }

  window.addEventListener('__focuscamou_state__', (event) => {
    const state = normalizeState(event.detail?.state);
    if (state.enabled) install(state);
  });

  window.addEventListener('__focuscamou_bootstrap__', (event) => {
    const state = normalizeState(event.detail?.state);
    if (state.enabled && state.features.windowswitch.on) {
      bootstrapWindowSwitch(state);
    }
  });

  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('__focuscamou_getstate__'));
  }, 0);
})();
