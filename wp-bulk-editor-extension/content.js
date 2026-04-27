(() => {
  const pending = new Map();
  let requestId = 0;

  function injectBridge() {
    if (document.documentElement.dataset.wsuWdsBridgeInjected === 'true') {
      return;
    }

    document.documentElement.dataset.wsuWdsBridgeInjected = 'true';
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page-bridge.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'WSU_WDS_PAGE') {
      return;
    }

    const resolver = pending.get(event.data.id);

    if (!resolver) {
      return;
    }

    pending.delete(event.data.id);
    resolver(event.data.response);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.source !== 'WSU_WDS_SIDEPANEL') {
      return false;
    }

    injectBridge();
    const id = String(++requestId);
    pending.set(id, sendResponse);
    window.postMessage({
      source: 'WSU_WDS_CONTENT',
      id,
      action: message.action,
      payload: message.payload || {}
    }, '*');

    setTimeout(() => {
      if (!pending.has(id)) {
        return;
      }

      pending.delete(id);
      sendResponse({
        ok: false,
        message: 'Timed out waiting for the WordPress page bridge.'
      });
    }, 8000);

    return true;
  });

  injectBridge();
})();
