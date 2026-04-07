;(function ($w, $d, H, I, L) {
  'use strict';

  const SEL = '[data-init],[data-bind],[data-effect],[data-store]'
  const STORES = {}

  /**
   * Monkey-patches history.pushState and history.replaceState so that `L`
   * (the last-fetched URL) stays in sync regardless of which code calls them,
   * including third-party libraries.
   */
  ;['pushState', 'replaceState'].forEach(m => {
    const o = H[m].bind(H)
    H[m] = (s, t, u) => { o(s, t, u); u && (L = new URL(u, L.href)) }
  })

  /**
   * Dispatches a custom event on a given node.
   * @param {Node} $n - The target DOM node.
   * @param {string} e - The event name.
   * @param {Object} [o={}] - Additional `CustomEvent` options.
   * @returns {boolean} - True if event dispatched.
   */
  const dispatch = ($n, e, o = {}) => $n.dispatchEvent(new CustomEvent(e, {bubbles: false, ...o}))

  /**
   * DOM node selector utility. Will use querySelectorAll() if a callback
   * is provided, otherwise querySelector().
   * @param {Element} $p - Parent element.
   * @param {string} s - Selector string.
   * @param {Function} [cb] - Callback for each element (Optional)
   * @returns {Element|Array} - Array of callback results if callback is
   *   provided, otherwise a single element.
   */
  const $ = ($p, s, cb) => !cb ? $p.querySelector(s) : Array.from($p.querySelectorAll(s), cb)

  /**
   * IntersectionObserver for reveal events.
   * @type {IntersectionObserver}
   */
  const obs = new IntersectionObserver((entries) => {
    for (const {isIntersecting: r, target: $n} of entries) {
      if (r && $n.getAttribute('on:reveal')) dispatch($n, 'reveal')
    }
  })

  const at = {
    /**
     * Debounce utility to postpone function execution until after a
     * specified delay.
     * @param {string} k - Unique key to identify the debounce instance.
     * @param {Node} $n - The target DOM node.
     * @param {Function} cb - Callback to be called after the debounce
     *   delay.
     * @param {number} s - Delay in ms.
     */
    debounce: (k, $n, cb, s) => {
      clearTimeout(($n._T ??= {})[k])
      $n._T[k] = setTimeout(cb, s)
    },
    dispatch,
    fetch,
    get: fetch,
    listen,
    /**
     * Performs a POST request to a specified URL with given options.
     * See also `fetch()`
     * @param {Node} $n - The target DOM node.
     * @param {string} u - A relative URL.
     * @param {Object} [o={}] - Fetch options, excluding method which is
     *   set to 'POST'.
     * @returns {Promise<Response>}
     */
    post: ($n, u, o = {}) => fetch($n, u, {method: 'POST', ...o}),
    /**
     * Sets a value in the store.
     * @param {Node} $n - Node.
     * @param {string} k - Key.
     * @param {number|string|undefined} i - Index by integer for array or object key
     * @param {*} v - Value.
     * @param {bool} Force numeric value (optional, default: false)
     */
    set: ($n, k, i, v, n) => {
      if (n) v = +v // Force numeric
      i == undefined ? $n._S[k] = v : $n._S[k][i] = v
      $n._S._M.touch(k) // Make sure we also render on $n._S.foo[k][i] = v
    }
  }

  /**
   * Cleans up and destroys internal state on a node and its children.
   * @param {Node} $n - DOM node to destroy.
   */
  function destroy($n) {
    if ($n.dataset.preserve !== undefined) return
    obs.unobserve($n)
    $($n, SEL, destroy)
    for (const k in $n._C ?? {}) for (const c of $n._C[k]) c()
    for (const k in $n._T ?? {}) clearTimeout($n._T[k])
    ;['_C', '_S', '_T'].forEach(k => delete $n[k])
  }

  /**
   * Fetches a resource and handles SSE, HTML, or errors.
   * A special element `<meta name="ssr-headers" content='"X-foo": "bar"'>`
   * can be used to include headers in the request, defined as a JSON
   * object in the content attribute.
   * @param {Node} $n - The target DOM node.
   * @param {string} url - A relative URL.
   * @param {Object} [o={}] - Fetch options, excluding signal which is
   *   managed internally.
   * @returns {Promise<Response|null>}
   */
  async function fetch($n, url, o = {}) {
    for (const c of ($n._C ??= {})[url] ?? []) c()
    const ac = new AbortController()
    $n._C[url] = [() => ac.abort()]

    const u = new URL(url.replace(/\#.*/, ''), L.href)
    if (o.search) toParams(o.search, u.searchParams)

    const $h = $($d.head, 'meta[name=ssr-headers]')
    const qh = $h ? fn($h, `return {${$h.content}}`)() : {}
    o.headers = toParams(qh, o.headers ?? new Headers())

    try {
      const r = await $w.fetch(u, {...o, signal: ac.signal})
      const ct = r.headers.get('content-type') ?? ''
      if (ct.startsWith('text/html')) {
        dispatch($n, 'ssr:sse-patch-elements', {bubbles: true, detail: {html: await r.text(), response: r, url}})
      } else if (ct.match(/\/json\b/)) {
        dispatch($n, 'ssr:sse-message', {bubbles: true, detail: {data: await r.json(), response: r, url}})
      } else if (ct == 'text/event-stream') {
        const decoder = new TextDecoder('utf-8')
        const reader = r.body.getReader()
        let buf = '', detail = {}
        for (;;) {
          const {done, value} = await reader.read()
          if (done) break
          buf += decoder.decode(value, {stream: true})
          for (;;) {
            const i = buf.indexOf('\n')
            if (i < 0) break
            if (i) {
              const [k, v] = buf.replace(/\r/g, '').slice(0, i).split(/:\s/, 2)
              detail[k] ??= ''
              detail[k] += v
            } else {
              detail.url = url
              dispatch($n, 'ssr:sse-' + detail.event, {detail})
              detail = {}
            }
            buf = buf.slice(i + 1)
          }
        }
      } else {
        dispatch($n, `ssr:${ct.split(';', 1)[0].replace(/\//g, 'g')}`, {bubbles: true, detail: {response: r, url}})
      }
      return r
    } catch (error) {
      if (error.name != 'AbortError') dispatch($n, 'ssr:sse-error', {bubbles: true, detail: {error, options: o, url}})
      return null
    }
  }

  /**
   * Compiles a string into a function, with store and event context.
   * The function body has access to `el` (the target DOM node), `evt`
   * (the event object), `store` (the current store), and `$()`.
   * @param {Node} $n - The target DOM node.
   * @param {string} b - Function body string.
   * @param {Function} [t=(b)=>b] - Transform function.
   * @returns {Function|undefined} - Generated function.
   */
  function fn($n, b, t = (b) => b) {
    const bt = t(b)
      .replace(/\$(\w+)\b/g, 'store.$1')
      .replace(/\@(debounce)\(/g, '__at.$1(el.id||"default",el,()=>')
      .replace(/\@(get|listen|post|set)\(/g, '__at.$1(el,')
      .replace(/\@(dispatch|fetch)\b/g, '__at.$1')

    try {
      const cb = new Function('$', 'el', 'store', '__at', 'evt', bt)
      return (e) => cb($, $n, $n._S, at, e)
    } catch (error) {
      console.error(error, $n, b)
    }
  }

  /**
   * Adds an event listener and tracks it for cleanup.
   * @param {Node} $n - The DOM node to store the cleanup function
   *   reference on. Typically the same as $t or the parent of $t.
   * @param {EventTarget} $t - The target DOM node.
   * @param {string} e - Event name.
   * @param {Function} cb - Callback to be called when the event is
   *   triggered.
   * @param {Object} [o={}] - Additional `addEventListener` options.
   * @returns {Function} - Cleanup function.
   */
  function listen($n, $t, e, cb, o = {}) {
    $t.addEventListener(e, cb, o)
    const u = () => { $t.removeEventListener(e, cb); $n._C[e].delete(u) }
    ;(($n._C ??= {})[e] ??= new Set()).add(u)
    return u
  }

  /**
   * Used internally to swap elements in the current DOM with new elements.
   * @param {Element} $p - Parent element that contains elements with
   *   [data-swap].
   */
  function swapElements($p) {
    $($p, '[data-swap]', ($c) => {
      if ($c.dataset.swap == 'none') return
      const s = $c.dataset.swap.split(':', 2)
      const $o = $($d, s[1])
      if (s[0] == 'morph' || s[0] == 'replaceWith') destroy($o)
      I && s[0] == 'morph' ? I.morph($o, $c) : $o[s[0]]($c)
    })
  }

  /**
   * Moves script and style elements from a fragment to the document head.
   * @param {Element} $p - Parent element that contains the script and
   *   style elements.
   * @param {string} url - URL used to identify the owner of the script
   *   or style element for cleanup purposes.
   */
  function scriptAndStyle($p, url) {
    $($p, 'style, script', ($c) => {
      const $s = $d.createElement($c.tagName)
      $s.nonce = $c.nonce
      $s.dataset.owner = url || $s.nonce
      $s.textContent = $c.textContent
      $d.head.appendChild($s)
      $c.remove()
    })
  }

  /**
   * Appends key-value pairs to a FormData or URLSearchParams.
   * @param {Object} i - Input object.
   * @param {FormData|URLSearchParams} [o=new FormData()] - Output object.
   * @returns {FormData|URLSearchParams}
   */
  function toParams(i, o = new FormData()) {
    for (const k in i ?? {}) o.append(k, JSON.stringify(i[k]).replace(/^"|"$/g, ''))
    return o
  }

  listen($w, $w, 'ssr:sse-error', ({detail: {options: o, url}, defaultPrevented: d, target}) => {
    if (!d && o.method == 'GET') setTimeout(() => target.parentNode && fetch(target, url, o), 3000)
  })

  /**
   * Listens for the 'ssr:init' event on the document element and
   * initializes stores, effects, and event listeners based on data
   * attributes. When the 'ssr:init' event is triggered, it searches for
   * elements with `data-init`, `data-bind`, `data-effect`, or
   * `data-store` attributes and sets up the necessary functionality for
   * each element, including creating stores, running initial code,
   * setting up event listeners, and handling two-way bindings.
   */
  listen($w, $d, 'ssr:init', ({target: $d}) => {
    $($d, SEL, ($n) => {
      if ($n._S) return
      const ds = $n.dataset

      /**
       * Creates a store wrapped inside a Proxy(), that allows for reactive
       * updates and tracking of dependencies. Note that the reactiveness is
       * not deep, so to be able to modify ex. arrays you need to use @set().
       */
      if (ds.store) {
        const m = new Set()
        m.touched = (ks) => ks.some(k => m.has(k))
        m.touch = (k) => {
          m.add(k)
          m.l ??= $w.requestAnimationFrame(() => {
            dispatch($n, 'ssr:render')
            $($n, SEL, ($c) => dispatch($c, 'ssr:render'))
            m.clear()
            delete m.l
          })
        }

        $n._S = new Proxy($n.id ? (STORES[$n.id] ??= {}) : {}, {
          get: (d, k) => k == '_M' ? m : d[k],
          set: (d, k, v) => {
            if (k == '_M' || (m.ro && !Object.hasOwn(d, k))) return false;
            if (!m.ro || d[k] !== v) { d[k] = v; m.touch(k) }
            return true
          }
        })
        fn($n, ds.store)()
      }

      // Looks for a store on the parent element, making it possible to
      // have a store on a parent element and use it in child elements
      // without having to pass it down manually. This is done by
      // traversing up the DOM tree until a store is found or the root
      // is reached, and assigning the store to the current node.
      let $p = $n
      while (!$n._S) {
        if (!$p || $p._S) $n._S = $p ? $p._S : {}
        $p = $p?.parentNode
      }

      // Run initial code
      if (ds.init) {
        $n._S._M.ro = false
        fn($n, ds.init)()
      }

      $n._S._M.ro = true

      // Listen for on:click, on:reveal and other events
      for (const a of $n.attributes) {
        const e = a.name.replace(/^on:/, '')
        if (e == 'reveal') obs.observe($n)
        if (e != a.name) listen($n, $n, e, fn($n, a.value))
      }

      // Two way binding
      if (ds.bind) {
        const [, key, idx] = ds.bind.match(/(\w+)\[(\d+)\]/) || ds.bind.match(/(\w+)/) || []
        const num = $n.type == 'number' || ds.type == 'number'
        const read = idx == undefined ? () => $n._S[key] : () => $n._S[key][idx]

        if ($n.type == 'checkbox' || $n.type == 'radio') {
          const byVal = $n.hasAttribute('value');
          listen($n, $n, 'change', () => at.set($n, key, idx, byVal ? $n.value : $n.checked, num))
          listen($n, $n, 'ssr:render', () => $n.checked = byVal ? $n.value == read() : read())
          at.set($n, key, idx, byVal ? $n.value : $n.checked, num)
        } else {
          listen($n, $n, $n.tagName == 'SELECT' ? 'change' : 'input', () => at.set($n, key, idx, $n.value, num))
          listen($n, $n, 'ssr:render', () => $n.value = read())
          at.set($n, key, idx, $n.value, num)
        }
      }

      // Run effects
      if (ds.effect) {
        /**
         * Effect callback for rendering.
         * @type {Function}
         */
        const cb = fn($n, ds.effect, (x) => {
          const u = x.replaceAll(/@use\(/g, 'el._S._M.touched(')
          if (u !== x) return u
          const ks = Array.from(x.matchAll(/\$(\w+)\b\s*(?!=)/g), (m) => `'${m[1]}'`).join(',')
          return `if(el._S._M.touched([${ks}])){${x};}`
        })

        listen($n, $n, 'ssr:render', cb)
      }
    })
  })

  /**
   * Listens for the 'ssr:sse-patch-elements' event on the window element,
   * parses the text as html and updates the DOM.
   * When the 'ssr:sse-patch-elements' event is triggered, it checks if
   * the provided HTML data contains a `<body>` tag. If it does, it
   * replaces the entire body content with the new content while
   * preserving elements marked with `data-preserve`. If it doesn't
   * contain a `<body>` tag, it treats the data as a fragment and updates
   * the DOM accordingly, using `data-owner` attributes to manage script
   * and style elements and `data-swap` attributes to determine how to
   * swap elements in the DOM.
   */
  listen($w, $w, 'ssr:sse-patch-elements', ({detail: {html, url}}) => {
    if (!I) I = $w.Idiomorph
    if (!html) return
    url = url?.toString() ?? ''
    if (html.lastIndexOf('<body', 4096) !== -1) {
      const $p = new DOMParser().parseFromString(html, 'text/html')
      let $c
      $($d, '[data-owner]', ($c) => $c.remove())
      destroy($d.body)
      scriptAndStyle($p, url)
      $($d, '[data-preserve]', ($c) => $($p, `#${$c.id}`, ($i) => $i.replaceWith($c.cloneNode(true))))
      if (($c = $($p, 'title'))) $($d, 'title', ($o) => $o.textContent = $c.textContent)
      if ($($p, '[data-swap]')) swapElements($p)
      else if (($c = $($p, 'body'))) $d.body.innerHTML = $c.innerHTML
    } else {
      const $p = $d.createRange().createContextualFragment(html)
      if (url.length) $($d, `[data-owner="${url}"]`, ($c) => $c.remove())
      scriptAndStyle($p, url)
      $($d, '[data-preserve=always]', ($c) => $($p, `#${$c.id}`, ($i) => $i.replaceWith($c.cloneNode(true))))
      swapElements($p)
      for (const $c of $p.children) {
        if ($c.dataset.swap == 'none') continue
        const $o = $c.id && $($d, `#${$c.id}`)
        if ($o) {
          destroy($o)
          I ? I.morph($o, $c) : $o.replaceWith($c)
        } else {
          console.warn("Can't swap unknown element", $c, $p)
        }
      }
    }

    dispatch($d, 'ssr:init')
  })

  /**
   * Listens for click events on the document and handles navigation
   * for links, preventing default browser navigation for same-origin
   * links and fetching the new page content instead.
   */
  listen($w, $d, 'click', ({defaultPrevented: x, preventDefault: p, target: $n}) => {
    $n = $n?.closest('[href]')
    if (x || !$n || $n.target.startsWith('_')) return // _blank, _top, _self, ...

    const url = new URL($n.href || $n.getAttribute('href'), L.href)
    const l = location
    if (url.origin !== l.origin) return
    if (url.hash && url.pathname === l.pathname && url.search === l.search) return

    const m = $n.dataset.history || 'pushState'
    if (m != 'none' && (l.pathname !== url.pathname || l.search !== url.search))
      H[m]({}, null, url.pathname + url.search)

    p()
    fetch($d.body, url.pathname + url.search, {})
  })

  /**
   * Listens for submit events on the window and handles form submissions,
   * including preventing default behavior, constructing fetch options based on
   * the form attributes, and managing the busy state of the submitter element.
   */
  listen($w, $d, 'submit', ({defaultPrevented: x, preventDefault: p, submitter: $s, target: $n}) => {
    $n = $n?.closest('form')
    if (x || !$n || $n.target.startsWith('_')) return // _blank, _top, _self, ...

    const [u, b, r] = [new URL($n.action, L.href), new FormData($n), {method: $n.method}]
    const m = $n.dataset.history || 'pushState'
    if (r.method.toLowerCase() == 'post') {
      const c = 'application/x-www-form-urlencoded'
      const t = $n.enctype || c
      r.headers = new Headers()
      r.headers.append('content-type', t)
      r.body = t == c ? new URLSearchParams(b) : b
      H[m]({}, null, $n.action)
    } else {
      for (const [k, v] of b.entries()) u.searchParams.append(k, v)
      H[m]({}, null, u.toString())
    }

    if ($s) $s.ariaBusy = 'true'
    p()
    fetch($d.body, u.toString(), r).finally(() => {
      $n.ariaBusy = 'false'
      if ($s) $s.ariaBusy = 'false'
    })
  })

  /**
   * Listens for popstate events on the window and fetches the current
   * location to update the page content accordingly.
   */
  listen($w, $w, 'popstate', () => {
    if (L.pathname === location.pathname && L.search === location.search) return
    L = location
    fetch($d.body, L.pathname + L.search, {})
  })

  // Defines a root store on the body element and dispatches 'ssr:init'
  // to initialize the application.
  if (!$d.body.dataset.store) $d.body.dataset.store = '$root=true'
  dispatch($d, 'ssr:init')
})(window, document, history, window.Idiomorph, location)
