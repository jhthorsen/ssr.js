;(function ($w, $d) {
  const data_sel = '[data-init], [data-bind], [data-effect], [data-store]'
  const S = {}
  const has = Object.hasOwn

  /**
   * Dispatches a custom event on a given node.
   * @param {Node} $n - The target DOM node.
   * @param {string} e - The event name.
   * @param {Object} [o={}] - Additional `CustomEvent` options.
   * @returns {boolean} - True if event dispatched.
   */
  const dispatch = ($n, e, o = {}) => $n.dispatchEvent(new CustomEvent(e, {bubbles: false, ...o}))

  /**
   * DOM node selector utility. Will use querySelectorAll() if a callback is provided, otherwise querySelector().
   * @param {Element} $p - Parent element.
   * @param {string} s - Selector string.
   * @param {Function} [cb] - Callback for each element (Optional)
   * @returns {Element|Array} - Array of elements if callback is provided, otherwise a single element.
   */
  const $ = ($p, s, cb) => !cb ? $p.querySelector(s) : [].map.call($p.querySelectorAll(s), cb)

  /**
   * IntersectionObserver for reveal events.
   * @type {IntersectionObserver}
   */
  const O = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const $n = entry.target
      if (!entry.isIntersecting) continue
      if ($n.getAttribute('on:reveal')) dispatch($n, 'reveal')
    }
  })

  const at = {
    /**
     * Debounce utility to postpone function execution until after a specified delay.
     * @param {string} k - Unique key to identify the debounce instance.
     * @param {Node} $n - The target DOM node.
     * @param {Function} cb - Callback to be called after the debounce delay.
     * @param {number} s - Delay in ms.
     */
    debounce: (k, $n, cb, s) => {
      ;($n._T ??= {})[k] && clearTimeout($n._T[k])
      $n._T[k] = setTimeout(cb, s)
    },
    dispatch,
    fetch,
    get: fetch,
    listen,
    /**
     * Performs a POST request to a specified URL with given options. See also `fetch()`
     * @param {Node} $n - The target DOM node.
     * @param {string} u - A relative URL.
     * @param {Object} [o={}] - Fetch options, excluding method which is set to 'POST'.
     * @returns {Promise<Response>}
     */
    post: ($n, u, o = {}) => fetch($n, u, {method: 'POST', ...o}),
    /**
     * Sets a value in the store.
     * @param {Node} $n - Node.
     * @param {string} k - Key.
     * @param {number|string} i - Index.
     * @param {*} v - Value.
     */
    set: ($n, k, i, v) => {
      $n._S[k][i] = v
      $n._S._D.render(k)
    },
  }

  /**
   * Cleans up and destroys internal state on a node and its children.
   * @param {Node} $n - DOM node to destroy.
   */
  function destroy($n) {
    if ($n.dataset.preserve != undefined) return
    O.unobserve($n)
    $($n, data_sel, destroy)
    for (const k in $n._C ?? {}) for (const c of $n._C[k]) c()
    for (const k in $n._T ?? {}) clearTimeout($n._T[k])
    ;['_C', '_S', '_T'].map((k) => delete $n[k])
  }

  /**
   * Fetches a resource and handles SSE, HTML, or errors.
   * A special element `<meta name="ssr-headers" content='"X-foo": "bar"'>` can be used to include headers in the request, defined as a JSON object in the content attribute.
   * @param {Node} $n - The target DOM node.
   * @param {string} u - A relative URL.
   * @param {Object} [o={}] - Fetch options, excluding signal which is managed internally.
   * @returns {Promise<Response|null>}
   */
  async function fetch($n, u, o = {}) {
    for (const c of ($n._C ??= {})[u] ?? []) c()
    const ac = new AbortController()
    $n._C[u] = [() => ac.abort()]

    const url = new URL(u, location.href)
    if (o.search) j(o.search, url.searchParams)

    const $h = $($d.head, 'meta[name=ssr-headers]')
    const qh = $h ? fn($h, `return {${$h.content}}`)() : {}
    o.headers = j(qh, o.headers ?? new Headers())

    try {
      const r = await $w.fetch(url, {...o, signal: ac.signal})
      const ct = r.headers.get('content-type') ?? ''
      if (ct == 'text/event-stream') {
        const [d, rdr] = [new TextDecoder('utf-8'), r.body.getReader()]
        let [b, e] = ['', {}]
        for (;;) {
          const {done, value} = await rdr.read()
          if (done) break
          b += d.decode(value, {stream: true})
          for (;;) {
            const i = b.indexOf('\n')
            if (i < 0) break
            if (i) {
              const [k, v] = b.slice(0, i).split(/:\s/, 2)
              e[k] ??= ''
              e[k] += v
            } else {
              e.url = u
              dispatch($d, 'ssr:sse-' + e.event, {detail: e})
              e = {}
            }
            b = b.slice(i + 1)
          }
        }
      } else if (ct.startsWith('text/html')) {
        const data = await r.text()
        dispatch($n, 'ssr:sse-patch-elements', {bubbles: true, detail: {data, url: u}})
      } else {
        console.warn(`TODO ${ct || r.url.toString()}`)
      }
      return r
    } catch (error) {
      if (error.name != 'AbortError') {
        dispatch($n, 'ssr:fetch-error', {bubbles: true, detail: {options: o, url: u, error}})
      }
      if (!o.method || o.method == 'GET') {
        setTimeout(() => $n.parentNode && fetch($n, u, o), 3000)
      }
      return null
    }
  }

  /**
   * Creates a function from a string, with store and event context.
   * The store has access to `el` (the target DOM node), `evt` (the event object), `store` (the current store), and `$()`.
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
   * Appends key-value pairs to a FormData or URLSearchParams.
   * @param {Object} i - Input object.
   * @param {FormData|URLSearchParams} [o=new FormData()] - Output object.
   * @returns {FormData|URLSearchParams}
   */
  function j(i, o = new FormData()) {
    for (const k in i ?? {}) {
      if (!k.startsWith('_')) {
        const v = typeof i[k].values == 'function' ? [...i[k].values()] : i[k]
        o.append(k, JSON.stringify(v).replace(/^"|"$/g, ''))
      }
    }
    return o
  }

  /**
   * Adds an event listener and tracks it for cleanup.
   * @param {Node} $n - The DOM node to store the cleanup function reference on. Typically the same as $t or the parent of $t.
   * @param {EventTarget} $t - The target DOM node.
   * @param {string} e - Event name.
   * @param {Function} cb - Callback to be called when the event is triggered.
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
   * Moves script and style elements from a fragment to the document head.
   * @param {Element} $p - Parent element that contains the script and style elements.
   * @param {string} url - URL that can be used to identify the owner of the script or style element for cleanup purposes.
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
   * Listens for the 'ssr:init' event on the document element and initializes stores, effects, and event listeners based on data attributes.
   * When the 'ssr:init' event is triggered, it searches for elements with `data-init`, `data-bind`, `data-effect`, or `data-store` attributes and sets up the necessary functionality for each element, including creating stores, running initial code, setting up event listeners, and handling two-way bindings.
   */
  listen($w, $d, 'ssr:init', (evt) => {
    $(evt.target, data_sel, ($n) => {
      if ($n._S) return

      // Create a store
      if ($n.dataset.store) {
        /**
         * Store object with render and update utilities.
         * @type {Set}
         */
        const d = new Set()
        /**
         * Dispatches a `ssr:render` event for the given key, batching multiple updates together using `requestAnimationFrame()`.
         * @param {string} k - Key.
         */
        d.render = (k) => {
          d.add(k)
          d._r ??= $w.requestAnimationFrame(() => {
            dispatch($n, 'ssr:render')
            $($n, data_sel, ($c) => dispatch($c, 'ssr:render'))
            d.clear()
            d.r = true
            delete d._r
          })
        }

        /**
         * Creates a proxy for the store that allows for reactive updates and tracking of dependencies.
         * Note that the reactiveness is not deep, so nested objects or arrays will not trigger updates when modified. To work around this, you can reassign the entire object or array to trigger an update.
         * @param {Array} kv - Keys.
         * @returns {boolean}
         */
        const u = (kv) => kv.some((k) => d.has(k))
        $n._S = new Proxy(S[$n.id] ?? {}, {
          get: (o, k) => k == '_D' ? d : k == '_U' ? u : o[k],
          set(o, k, v) {
            if (d.r && !has(o, k)) throw `${k} is not defined`
            if (!d.r || o[k] !== v) {
              o[k] = v
              d.render(k)
            }
            return true
          },
        })

        if ($n.id) S[$n.id] = $n._S
        // Run initial store code, allowing for pre-population of the store with
        // data before any effects or event listeners run. This is useful for
        // setting up initial state or fetching data when the store is created.
        fn($n, $n.dataset.store)()
      }

      // Looks for a store on the parent object, making it possible to have a
      // store on a parent element and use it in child elements without having
      // to pass it down manually. This is done by traversing up the DOM tree
      // until a store is found or the root is reached, and assigning the store
      // to the current node for easy access.
      let [$p, s] = [$n]
      while (!$n._S) {
        if (!$p || $p._S) s = $n._S = $p ? $p._S : {}
        $p = $p?.parentNode
      }

      // Run initial code
      if ($n.dataset.init) {
        if ($n.id) S[$n.id] = $n._S
        delete $n._S._D.r
        fn($n, $n.dataset.init)()
      }

      // Listen for on:click, on:reveal and other events
      for (const a of $n.attributes) {
        const e = a.name.replace(/^on:/, '')
        if (e == 'reveal') O.observe($n)
        if (e != a.name) listen($n, $n, e, fn($n, a.value))
      }

      // Two way binding
      if ($n.dataset.bind) {
        const [_, k, i] = $n.dataset.bind.match(/(\w+)\[(\d+)\]/) || $n.dataset.bind.match(/(\w+)/) || []
        const n = $n.type == 'number' || $n.dataset.type == 'number'
        const w = i == undefined ? (v) => (s[k] = n ? +v : v) : (v) => (s[k][i] = n ? +v : v)
        const r = i == undefined ? () => s[k] : () => s[k][i]

        if ($n.type == 'checkbox' || $n.type == 'radio' || $n.tagName == 'SELECT') {
          const byVal = $n.hasAttribute('value')
          listen($n, $n, 'change', () => { w(byVal ? $n.value : $n.checked); s._D.render(k) })
          listen($n, $n, 'ssr:render', () => { $n.checked = byVal ? $n.value == r() : r() })
          w(byVal ? $n.value : $n.checked)
        } else {
          listen($n, $n, 'input', () => { w($n.value); s._D.render(k) })
          listen($n, $n, 'ssr:render', () => { $n.value = r() })
          w($n.value)
        }
      }

      // Run effects
      if ($n.dataset.effect) {
        /**
         * Effect callback for rendering.
         * @type {Function}
         */
        const cb = fn($n, $n.dataset.effect, (x) => {
          const u = x.replaceAll(/@use\(/g, 'store._U(')
          if (u !== x) return u
          const ks = Array.from(x.matchAll(/\$(\w+)\b\s*(?!=)/g), (m) => `'${m[1]}'`).join(',')
          return `if(store._U([${ks}])){${x};}`
        })

        listen($n, $n, 'ssr:render', cb)
      }
    })
  })

  /**
   * Listens for the 'ssr:sse-patch-elements' event on the document element and updates the DOM based on the provided HTML data.
   * When the 'ssr:see-patch-elements' event is triggered, it checks if the provided HTML data contains a `<body>` tag. If it does, it replaces the entire body content with the new content while preserving elements marked with `data-preserve`. If it doesn't contain a `<body>` tag, it treats the data as a fragment and updates the DOM accordingly, using `data-owner` attributes to manage script and style elements and `data-swap` attributes to determine how to swap elements in the DOM.
   */
  listen($w, $d, 'ssr:sse-patch-elements', ({detail}) => {
    const url = detail.url?.toString() ?? ''
    if (detail.data.lastIndexOf('<body', 4096) !== -1) {
      let [$p, $c] = [new DOMParser().parseFromString(detail.data, 'text/html')]
      $($d, '[data-owner]', ($c) => $c.remove())
      destroy($d.body)
      scriptAndStyle($p, url)
      $($d, '[data-preserve]', ($c) => $($p, `#${$c.id}`, ($i) => $i.replaceWith($c.cloneNode(true))))
      if (($c = $($p, 'title'))) $($d, 'title', ($o) => $o.textContent = $c.textContent)
      if (($c = $($p, 'body'))) $d.body.innerHTML = $c.innerHTML
    } else {
      const $p = $d.createRange().createContextualFragment(/^\s*<tr\b/.test(detail.data) ? `<table data-template="tr">${detail.data}</table>` : detail.data)
      if (url.length) $($d, `[data-owner="${url}"]`, ($c) => $c.remove())
      scriptAndStyle($p, url)
      $($d, '[data-preserve=always]', ($c) => $($p, `#${$c.id}`, ($i) => $i.replaceWith($c.cloneNode(true))))
      $($p, '[data-swap]', ($c) => {
        if ($c.dataset.swap == 'none') return
        const swap = $c.dataset.swap.split(':', 2)
        const $o = $($d, swap[1])
        if (swap[0] == 'morph' || swap[0] == 'replaceWith') destroy($o)
        swap[0] == 'morph' ? Idiomorph.morph($o, $c) : $o[swap[0]]($c)
      })
      for (const $t of $p.children) {
        if ($t.dataset.swap == 'none') continue
        for (const $c of $t.dataset.template ? $t.querySelectorAll($t.dataset.template) : [$t]) {
          const $o = $c.id && $($d, `#${$c.id}`)
          if ($o) {
            destroy($o)
            Idiomorph ? Idiomorph.morph($o, $c) : $o.replaceWith($c)
            setTimeout(() => dispatch($o, 'ssr:sse-patched'), 0)
          } else {
            console.warn({message: "Can't swap unknown element", $c})
          }
        }
      }
    }

    dispatch($d, 'ssr:init')
  })

  /**
   * Listens for click events on the document body and handles navigation for links and form submissions.
   */
  listen($w, $d.body, 'click', (evt) => {
    if (evt.target?.closest('button, input, select, textarea')) return

    const $n = evt.target?.closest('[href]')
    if (!$n || $n.target == '_top') return
    if ($n.target == 'preventDefault') evt.preventDefault()
    if (evt.defaultPrevented) return

    const url = new URL($n.href || $n.getAttribute('href'), location.href)
    if (url.origin !== location.origin) return // external link

    if (location.pathname !== url.pathname || location.search !== url.search) {
      history.pushState({}, null, url.pathname + url.search)
    }

    evt.preventDefault()
    fetch($d.body, url.pathname + url.search, {})
  })

  /**
   * Listens for submit events on the document body and handles form submissions, including preventing default behavior, constructing fetch options based on the form attributes, and managing the busy state of the submitter element.
   */
  listen($w, $d, 'submit', (evt) => {
    const $n = evt.target?.closest('form')
    if (!$n || $n.target == '_top') return
    if (evt.target?.closest('input, select, textarea')) evt.preventDefault()
    if ($n.target == 'preventDefault') evt.preventDefault()
    if (evt.defaultPrevented) return

    const r = {method: $n.method}
    const b = new FormData($n)
    if (r.method.toLowerCase() == 'post') {
      const c = 'application/x-www-form-urlencoded'
      const t = $n.enctype || c
      r.headers = new Headers()
      r.headers.append('content-type', t)
      r.body = t == c ? new URLSearchParams(b) : b
      history.pushState({}, null, $n.action)
    } else {
      r.search = Object.fromEntries(b.entries())
      history.pushState({}, null, $n.action + '?' + new URLSearchParams(b).toString())
    }

    const $s = evt.submitter
    if ($s) $s.ariaBusy = 'true'
    evt.preventDefault()
    fetch($d.body, $n.action, r).finally(() => {
      $n.ariaBusy = 'false'
      if ($s) $s.ariaBusy = 'false'
    })
  })

  /*
   * Listens for popstate events on the window and fetches the current location to update the page content accordingly.
   */
  listen($w, $w, 'popstate', () => {
    fetch($d.body, location.href, {})
  })

  // Defines a root store on the body element and dispatches the 'ssr:init' event to initialize the application.
  if (!$d.body.dataset.store) $d.body.dataset.store = '$root=true'
  dispatch($d, 'ssr:init')
})(window, document)
