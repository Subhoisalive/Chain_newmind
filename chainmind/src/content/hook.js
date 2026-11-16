// Chain Mind — Made by Suvhankar Dutta
// Runs in the page's own JavaScript world at document_start, before the app
// boots, so it can wrap fetch and XMLHttpRequest before the app captures a
// reference to them.
//
// It never blocks, rewrites, or delays a request. It clones responses and
// posts them to the isolated-world bridge. Requests are matched by substring
// so an unrelated site would produce nothing even if this ran there.

(() => {
  const CAPTURE = [
    '/backend-api/conversation',
    '/backend-api/files',
    '/chat_conversations/',
    '/rest/app-chat/conversations/',
    '/rest/app-chat/upload-file',
    '/upload'
  ];

  const interesting = (url) => typeof url === 'string' && CAPTURE.some((frag) => url.includes(frag));

  function emit(payload) {
    window.postMessage({ __chainmind: true, ...payload }, location.origin);
  }

  // The bridge needs the verb to tell an upload from a file listing, and the
  // two are the same path on ChatGPT.
  function methodOf(input, init) {
    if (init?.method) return init.method;
    if (input && typeof input === 'object' && input.method) return input.method;
    return 'GET';
  }

  // --- fetch ---------------------------------------------------------------
  const nativeFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const method = methodOf(input, init);
    const response = await nativeFetch.apply(this, arguments);
    if (!interesting(url)) return response;

    const type = response.headers.get('content-type') || '';

    // Streaming replies: tee the body so the app still gets its stream intact,
    // and accumulate the deltas on our copy.
    if (type.includes('event-stream') && response.body) {
      const [appStream, ourStream] = response.body.tee();
      emit({ kind: 'stream-start', url, method });
      readStream(ourStream, url, method);
      return new Response(appStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }

    response
      .clone()
      .text()
      .then((body) => emit({ kind: 'response', url, method, body }))
      .catch(() => {});
    return response;
  };

  async function readStream(stream, url, method) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assembled = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          assembled += data + '\n';
        }
      }
    } catch {
      /* the app may abort the stream; partial data is still useful */
    }
    emit({ kind: 'stream', url, method, body: assembled });
  }

  // --- XMLHttpRequest ------------------------------------------------------
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__chainmindUrl = url;
    this.__chainmindMethod = method;
    return open.apply(this, arguments);
  };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => {
      if (!interesting(this.__chainmindUrl)) return;
      if (typeof this.responseText !== 'string') return;
      emit({
        kind: 'response',
        url: this.__chainmindUrl,
        method: this.__chainmindMethod,
        body: this.responseText
      });
    });
    return send.apply(this, arguments);
  };

  // Single-page navigation: tell the bridge the conversation may have changed.
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function () {
      const result = original.apply(this, arguments);
      emit({ kind: 'navigate', url: location.href });
      return result;
    };
  }
  window.addEventListener('popstate', () => emit({ kind: 'navigate', url: location.href }));
})();
