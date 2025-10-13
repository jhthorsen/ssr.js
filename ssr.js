;(function ($w, $d) {
  const data_sel = '[data-init], [data-bind], [data-effect]'
  const dispatch = ($n, e, o = {}) => $n.dispatchEvent(new CustomEvent(e, {bubbles: false, ...o}))
  const has = Object.hasOwn
  const $map = ($p, s, cb) => [].map.call($p.querySelectorAll(s), cb)
  const $q = ($p, s) => $p.querySelector(s)

  const at = {
    get: fetch,
    delete: ($n, u, o = {}) => fetch($n, u, {method: 'DELETE', ...o}),
    post: ($n, u, o = {}) => fetch($n, u, {method: 'POST', ...o}),
    map: $map,
    q: $q,
    render: R,
    delay,
    dispatch,
    listen,
  }

  function delay(x, $n, cb, s = 0) {
    ;($n._T ??= {})[x] && clearTimeout($n._T[x])
    $n._T[x] = setTimeout(cb, s)
  }

  async function fetch($n, u, q = {}) {
    ;($n._F ??= {})[u] && $n._F[u].abort()
    const ac = $n._F[u] = new AbortController()
    const url = new URL(u, location.href)
    const s = getStore($n)

    if (s) {
      for (const k in s) {
        if (!k.startsWith('_')) {
          url.searchParams.append(k, JSON.stringify(s[k]).replace(/^"|"$/g, ''))
        }
      }
    }

    const $h = $q($d.head, 'meta[name=ssr-headers]')
    const qh = $h ? fn('', $h, `return {${$h.content}}`)() : {}
    qh['accept'] ??= 'text/event-stream, text/html, application/json'
    qh['x-ssr'] ??= 'csr'
    qh['x-source'] ??= $n.id ? `#{$n.id}` : `${$n.tagName.toLowerCase()}`

    try {
      const r = await $w.fetch(url, {
        ...q,
        headers: {...qh, ...(q.headers || {})},
        signal: ac.signal,
      })

      const rh = Object.fromEntries(
        [...r.headers].map(([k, v]) => [k.replace(/^x-sse-/, '').replace(/-/g, '_'), v]),
      )

      const ct = rh['content_type'] ?? ''
      if (ct.startsWith('text/html')) {
        const data = await r.text()
        dispatch($n, 'ssr:sse-patch-elements', {bubbles: true, detail: {...rh, data}})
      } else {
        console.warn(`TODO ${ct}`)
      }
    } catch (error) {
      if (error.name === 'AbortError') return
      console.error({url: url.toString(), d: q, error})
    }
  }
  function fn(x, $n, v) {
    const b = v
      .replace(/\@delay\(/g, '__at.delay(x, el, ()=>')
      .replace(/\@(delete|get|fetch|post)\(/g, '__at.$1(el,')
      .replace(/\@(\w+)\(/g, '__at.$1(')
      .replace(/\$(\w+)/g, 'store.$1')

    try {
      const s = /\bstore\.\w/.test(b) ? store($n) : null
      const cb = new Function('x', 'el', '__at', 'store', 'evt', b)
      return (e) => cb(x, $n, at, s, e)
    } catch (error) {
      console.error({n: $n, b, error})
    }
  }

  function getStore($n, k = null) {
    while ($n) {
      if ($n._S && (k === null || has($n._S, k))) return $n._S
      $n = $n.parentNode
    }
  }

  function listen($n, e, cb) {
    ;(($n._E ??= {})[e] ??= new Set()).add(cb)
    $n.addEventListener(e, cb)
  }

  function R() {
    R.id ??= $w.requestAnimationFrame(() => {
      dispatch($d, 'ssr:render')
      R.rendered = true
      delete R.id
    })
  }

  function store($n) {
    return $n._S ??= new Proxy({}, {
      get(o, k) {
        if (has(o, k)) return o[k]
        const s = getStore($n.parentNode)
        return s ? s[k] : undefined // Will continue to traverse upwards the tree
      },
      set(o, k, v) {
        if (o[k] === v || !R.rendered) {
          o[k] = v // Do not traverse the tree or call render() when it's the same value
        } else if (has(o, k)) {
          o[k] = v
          R($n)
        } else {
          const s = getStore($n.parentNode)
          if (s) {
            s[k] = v // Will continue to traverse upwards the tree
          } else {
            console.error({error: 'No stores with the given key', k, v})
          }
        }
        return true
      },
    })
  }

  listen($d, 'ssr:init', (evt) => {
    R.rendered = false
    $map(evt.target, data_sel, ($n) => {
      if ($n._E) return
      $n._E = {}

      if ($n.dataset.init) {
        fn('init', $n, $n.dataset.init)()
      }

      for (const attr of $n.attributes) {
        const $el = /^@window/.test(attr.name) ? $w : $n
        const e = attr.name.replace(/^@(window:)?/, '')
        if (e === attr.name) continue
        const cb = fn('on', $n, attr.value)
        listen($el, e, (evt) => cb(evt) === false || R($n))
      }

      if ($n.dataset.bind) {
        const k = $n.dataset.bind.replace(/^\s*\$/, '')
        const s = getStore($n, k) || store($n)
        s[k] ??= $n.value

        if ($n.type === 'checkbox' || $n.type === 'radio' || $n.tagName == 'SELECT') {
          listen($n, 'change', () => {
            const b = !$n.hasAttribute('value')
            if (s[k] instanceof Set) {
              s[k][$n.checked ? 'add' : 'delete']($n.value)
              R($n) // Manual render, since the store can't detect changes inside the Set()
            } else {
              s[k] = $n.checked ? (b ? true : $n.value) : (b ? false : '')
            }
          })
          listen($d, 'ssr:render', () => {
            if (s[k] instanceof Set) {
              $n.checked = s[k].has($n.value)
            } else {
              $n.checked = s[k] === true || s[k] == $n.value // Want to match numbers as well as strings
            }
          })
        } else {
          listen($n, 'input', () => (s[k] = $n.value))
          listen($d, 'ssr:render', () => $n.value = s[k])
        }
      }

      if ($n.dataset.effect) {
        listen($d, 'ssr:render', fn('effect', $n, $n.dataset.effect))
      }
    })
  })

  listen($d.body, 'click', () => {
  })

  listen($w, 'popstate', () => {
  })

  dispatch($d, 'ssr:init')
})(window, document)
