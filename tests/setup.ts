if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (typeof window !== 'undefined' && !window.visualViewport) {
  const visualViewport = Object.assign(new EventTarget(), {
    height: window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    width: window.innerWidth,
  })
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: visualViewport })
}
