(() => {
  const _ael = EventTarget.prototype.addEventListener;
  const _fetch = window.fetch;
  const _xhrOpen = XMLHttpRequest.prototype.open;
  const _xhrSend = XMLHttpRequest.prototype.send;
  const noop = () => {};

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

  let installed = false;
  let mouseScheduleTimer = null;
  let mouseMoveActive = false;
  let realPageFocused = true;
  let realPageHidden = false;
  let realTrackerInstalled = false;
  let bootstrapped = false;

  function normalizeState(state) {
    const next = state ? JSON.parse(JSON.stringify(state)) : JSON.parse(JSON.stringify(DEFAULT_STATE));

    next.features ||= {};
    next.features.visibility ||= { on: true, mode: 'block' };
    next.features.focus ||= { on: true, mode: 'block' };
    next.features.mouse ||= { on: false };
    next.features.network ||= { on: false };
    next.features.windowswitch ||= { on: false };

    next.enabled ??= false;
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

  function installRealFocusTracker() {
    if (realTrackerInstalled) return;
    realTrackerInstalled = true;

    _ael.call(window, 'focus', () => {
      realPageFocused = true;
    }, true);

    _ael.call(window, 'blur', () => {
      realPageFocused = false;
    }, true);

    _ael.call(document, 'visibilitychange', () => {
      try {
        realPageHidden = document.visibilityState === 'hidden';
      } catch (e) {
        realPageHidden = false;
      }
    }, true);

    _ael.call(document, 'webkitvisibilitychange', () => {
      try {
        realPageHidden = document.webkitVisibilityState === 'hidden';
      } catch (e) {
        realPageHidden = false;
      }
    }, true);
  }

  function shouldSimulateMouse() {
    return !realPageFocused || realPageHidden;
  }

  function isTopFrame() {
    try {
      return window.top === window;
    } catch (e) {
      return false;
    }
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
    installRealFocusTracker();

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

    if (mouseOn && isTopFrame()) {
      startMouse();
    }

  }

  function startMouse() {
    function rand(min, max) {
      return min + Math.random() * (max - min);
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function easeInOutSine(t) {
      return -(Math.cos(Math.PI * t) - 1) / 2;
    }

    function quadraticPoint(t, p0, p1, p2) {
      const u = 1 - t;
      return (
        u * u * p0 +
        2 * u * t * p1 +
        t * t * p2
      );
    }

    function move() {
      if (!shouldSimulateMouse() || mouseMoveActive) return;
      mouseMoveActive = true;

      const width = Math.max(window.innerWidth, 320);
      const height = Math.max(window.innerHeight, 240);
      const marginX = Math.min(90, width * 0.12);
      const marginY = Math.min(70, height * 0.12);

      const fromX = move._x ?? rand(width * 0.22, width * 0.78);
      const fromY = move._y ?? rand(height * 0.22, height * 0.78);
      const toX = rand(marginX, width - marginX);
      const toY = rand(marginY, height - marginY);

      const distance = Math.hypot(toX - fromX, toY - fromY);
      const bendScale = clamp(distance * rand(0.18, 0.42), 45, 260);
      const sweep = rand(-1, 1);
      const cpX = clamp(
        (fromX + toX) / 2 + bendScale * sweep,
        0,
        width
      );
      const cpY = clamp(
        (fromY + toY) / 2 + bendScale * rand(-0.9, 0.9),
        0,
        height
      );

      const steps = Math.floor(rand(10, 20));
      const duration = rand(90, 220);
      const tick = Math.max(10, Math.round(duration / steps));
      let step = 0;

      const timer = setInterval(() => {
        if (!installed) {
          clearInterval(timer);
          mouseMoveActive = false;
          return;
        }

        if (!shouldSimulateMouse()) {
          clearInterval(timer);
          mouseMoveActive = false;
          return;
        }

        step++;
        const t = easeInOutSine(step / steps);
        const wobble = Math.sin(t * Math.PI * rand(1.2, 2.6)) * rand(0.5, 2.2);
        const x = quadraticPoint(t, fromX, cpX, toX) + wobble;
        const y = quadraticPoint(t, fromY, cpY, toY) + wobble * rand(-1.2, 1.2);
        const clampedX = clamp(x, 0, width);
        const clampedY = clamp(y, 0, height);

        document.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          clientX: Math.round(clampedX),
          clientY: Math.round(clampedY)
        }));

        if (step >= steps) {
          clearInterval(timer);
          move._x = toX;
          move._y = toY;
          mouseMoveActive = false;
        }
      }, tick);
    }

    function schedule() {
      mouseScheduleTimer = setTimeout(() => {
        if (!installed) return;
        if (shouldSimulateMouse()) {
          move();
        }
        schedule();
      }, rand(3200, 7600));
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
