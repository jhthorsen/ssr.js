;(function ($w, $d) {
  const data_sel = '[data-init], [data-bind], [data-effect]'
  const dispatch = ($n, e, o = {}) => $n.dispatchEvent(new CustomEvent(e, {bubbles: false, ...o}))
  const has = Object.hasOwn
  const $map = ($p, s, cb) => [].map.call($p.querySelectorAll(s), cb)
  const $q = ($p, s) => $p.querySelector(s)

  const at = {
    ready: false,
    class: ($n, kv) => Object.entries(kv).forEach(([n, b]) => $n.classList.toggle(n, b)),
    delete: ($n, u, o = {}) => fetch($n, u, {method: 'DELETE', ...o}),
    post: ($n, u, o = {}) => fetch($n, u, {method: 'POST', ...o}),
    debounce,
    destroy,
    dispatch,
    get: fetch,
    j,
    listen,
    map: $map,
    q: $q,
  }

  function debounce(x, $n, cb, s = 0) {
    ;($n._T ??= {})[x] && clearTimeout($n._T[x])
    $n._T[x] = setTimeout(cb, s)
  }

  function destroy($n) {
    $map($n, data_sel, destroy)
    for (const k in $n._T ?? {}) clearTimeout($n._T[k])
    for (const k in $n._F ?? {}) $n._F[k].abort()
    for (const k in $n._E ?? {}) for (const cb in $n._E[k]) $n.removeEventListener(k, cb)
  }

  async function fetch($n, u, q = {}) {
    ;($n._F ??= {})[u] && $n._F[u].abort()
    const ac = $n._F[u] = new AbortController()
    const url = new URL(u, location.href)

    try {
      j(q.search ?? $store($n)?._S ?? {}, url.searchParams)

      const $h = $q($d.head, 'meta[name=ssr-headers]')
      const qh = $h ? fn('headers', $h, `return {${$h.content}}`)() : {}
      q.headers = j(qh, q.headers ?? new Headers())

      const r = await $w.fetch(url, {...q, signal: ac.signal})
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
              dispatch($n, 'ssr:sse-' + e.event, {bubbles: true, detail: e})
              e = {}
            }
            b = b.slice(i + 1)
          }
        }
      } else if (ct.startsWith('text/html')) {
        const data = await r.text()
        dispatch($n, 'ssr:sse-patch-elements', {bubbles: true, detail: {data}})
      } else {
        console.warn(`TODO ${ct}`)
      }
    } catch (error) {
      if (error.name == 'AbortError') return
      console.error({url: url.toString(), d: q, error})
    }
  }

  function fn(x, $n, v) {
    const b = v
      .replace(/\@debounce\(/g, '__at.debounce(x, el, ()=>')
      .replace(/\@(class|delete|get|fetch|post)\(/g, '__at.$1(el,')
      .replace(/\@(class|delete|get|fetch|post|ready)\b/g, '__at.$1')
      .replace(/\@(\w+)\(/g, '__at.$1(')
      .replace(/\$(\w+)/g, (_, k) => {
        $n._C.set(k, false)
        return `store.${k}`
      })

    try {
      const s = /\bstore\b/.test(b) && (x == 'init' ? store($n) : $store($n)?._S)
      const cb = new Function('x', 'el', '__at', 'store', 'evt', b)
      return (e) => cb(x, $n, at, s, e)
    } catch (error) {
      console.error({n: $n, b, error})
    }
  }

  function j(i, o = new FormData()) {
    for (const k in i ?? {}) {
      if (!k.startsWith('_')) {
        o.append(k, JSON.stringify(i[k]).replace(/^"|"$/g, ''))
      }
    }
    return o
  }

  function listen($n, e, cb) {
    ;(($n._E ??= {})[e] ??= new Set()).add(cb)
    $n.addEventListener(e, cb)
  }

  function R($n, ks) {
    const q = (R.q ??= new Set())
    $n = $store($n)
    q.add($n)

    const nd = ($n._C ??= new Set())
    for (const k of ks) {
      if (!nd.get(k)) $map($n, data_sel, ($c) => (!$c._C || $c._C.has(k)) && q.add($c))
      nd.set(k, true)
    }

    R.id ??= $w.requestAnimationFrame(() => {
      const q = new Set(R.q)
      R.q.clear()
      delete R.id
      for (const $v of q.values()) dispatch($v, 'ssr:render')
      for (const $v of q.values()) for (const k of $v._C.keys()) $v._C.set(k, false)
      at.ready = true
    })
  }

  function $store($n, k = null) {
    while ($n) {
      if ($n._S && (k === null || has($n._S, k))) return $n
      $n = $n.parentNode
    }
  }

  function store($n) {
    return $n._S ??= new Proxy({}, {
      get(o, k) {
        return has(o, k) ? o[k] : $store($n.parentNode, k)?._S[k]
      },
      set(o, k, v) {
        if (has(o, k) || !at.ready) {
          if (o[k] !== v) R($n, [k])
          o[k] = v
        } else {
          const $s = $store($n.parentNode, k)
          if (!$s) return console.error({error: 'No stores with the given key', k, v})
          $s._S[k] = v // Calls set() on the parent store
        }
        return true
      },
    })
  }

  listen($d, 'ssr:init', (evt) => {
    $map(evt.target, data_sel, ($n) => {
      if ($n._C) return
      $n._C = new Map()

      if ($n.dataset.init) {
        at.ready = false
        fn('init', $n, $n.dataset.init)()
      }

      for (const attr of $n.attributes) {
        const $t = /^@window/.test(attr.name) ? $w : $n
        const e = attr.name.replace(/^@(window:)?/, '')
        if (e == attr.name) continue
        const cb = fn('on', $n, attr.value)
        listen($t, e, (evt) => cb(evt) === false || R($n, $n._C.keys()))
      }

      if ($n.dataset.bind) {
        const k = $n.dataset.bind.replace(/^\s*\$/, '')
        const s = $store($n, k)?._S || store($n)
        s[k] ??= $n.value
        $n._C.set(k, false)

        if ($n.type == 'checkbox' || $n.type == 'radio' || $n.tagName == 'SELECT') {
          listen($n, 'change', () => {
            const b = !$n.hasAttribute('value')
            if (s[k] instanceof Set) {
              s[k][$n.checked ? 'add' : 'delete']($n.value)
              R($n, [k]) // Manual render, since the store can't detect changes inside Set()
            } else {
              s[k] = $n.checked ? (b ? true : $n.value) : (b ? false : '')
            }
          })
          listen($n, 'ssr:render', () => {
            if (s[k] instanceof Set) {
              $n.checked = s[k].has($n.value)
            } else {
              $n.checked = s[k] === true || s[k] == $n.value // Want to match numbers as well as strings
            }
          })
        } else {
          listen($n, 'input', () => (s[k] = $n.value))
          listen($n, 'ssr:render', () => $n.value = s[k])
        }
      }

      if ($n.dataset.effect) {
        listen($n, 'ssr:render', fn('effect', $n, $n.dataset.effect))
      }
    })
  })

  listen($d, 'ssr:sse-patch-elements', ({detail}) => {
    if (detail.data.lastIndexOf('<body', 2048) !== -1) {
      destroy($d.body)
      let [$p, $a] = [new DOMParser().parseFromString(detail.data, 'text/html')]
      if (($a = $q($p, 'body'))) $d.body.innerHTML = $a.innerHTML
      if (($a = $q($p, 'title'))) $map($d, 'title', ($n) => $n.replaceWith($n))
      $map($p, 'script[nonce]', ($n) => $d.head.appendChild($n))
      $map($p, 'style[nonce]', ($n) => $d.head.appendChild($n))
    } else {
      const $p = $d.createRange().createContextualFragment(detail.data)
      if (detail.title) $d.title = detail.title
      for (const $n of $p.children) {
        const swap = ($n.dataset.swap || `replaceWith:#${$n.id}`).split(':', 2)
        const $c = $q($d, swap[1])
        destroy($c)
        $c[swap[0]]($n)
      }
    }

    dispatch($d, 'ssr:init')
  })

  listen($d.body, 'click', (evt) => {
    if (evt.target?.closest('button, input, select, textarea')) return

    const $n = evt.target?.closest('[href]')
    if (!$n || $n.target == '_top') return
    for (const a of $n.attributes) {
      if (a.name == '@click') return
    }

    const url = new URL($n.href || $n.getAttribute('href'), location.href)
    if (url.origin !== location.origin) return // external link

    if (location.pathname !== url.pathname || location.search !== url.search) {
      history.pushState({}, null, url.pathname + url.search)
    }

    evt.preventDefault()
    fetch($d.body, url.pathname + url.search, {})
  })

  listen($w, 'popstate', () => {
    fetch($d.body, location.href, {})
  })

  dispatch($d, 'ssr:init')
})(window, document)
