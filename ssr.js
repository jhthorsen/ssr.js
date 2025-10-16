;(function ($w, $d) {
  const data_sel = '[data-init], [data-bind], [data-effect]'
  const S = {}
  const dispatch = ($n, e, o = {}) => $n.dispatchEvent(new CustomEvent(e, {bubbles: false, ...o}))
  const has = Object.hasOwn
  const listen = ($n, e, cb, o = {}) => $n.addEventListener(e, cb, o)
  const $map = ($p, s, cb) => [].map.call($p.querySelectorAll(s), cb)
  const $q = ($p, s) => $p.querySelector(s)

  const at = {
    class: ($n, kv) => Object.entries(kv).forEach(([n, b]) => $n.classList.toggle(n, b)),
    delete: ($n, u, o = {}) => fetch($n, u, {method: 'DELETE', ...o}),
    debounce: (k, $n, cb, s) => {
      ;($n._T ??= {})[k] && clearTimeout($n._T[k])
      $n._T[k] = setTimeout(cb, s)
    },
    destroy,
    dispatch,
    j,
    get: fetch,
    listen: ($n, $t, e, cb, o = {}) => {
      ;($n._C ??= {})[e] && $n._C[e].abort()
      o.signal = ($n._C[e] = new AbortController()).signal
      listen($t, e, cb, o)
    },
    map: $map,
    post: ($n, u, o = {}) => fetch($n, u, {method: 'POST', ...o}),
    q: $q,
  }

  function destroy($n, r = true) {
    $map($n, data_sel, destroy)
    if ($n.dataset.destroy) fn('destroy', $n, $n.dataset.destroy)()
    for (const k in $n._C ?? {}) $n._C[k].abort()
    for (const k in $n._T ?? {}) clearTimeout($n._T[k])
    if (r) $n.remove()
  }

  async function fetch($n, u, q = {}) {
    ;($n._C ??= {})[u] && $n._C[u].abort()
    const url = new URL(u, location.href)
    j(q.search ?? $n._S ?? {}, url.searchParams)

    const $h = $q($d.head, 'meta[name=ssr-headers]')
    const qh = $h ? fn('headers', $h, `return {${$h.content}}`)() : {}
    q.headers = j(qh, q.headers ?? new Headers())

    try {
      const ac = $n._C[u] = new AbortController()
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
              dispatch($d, 'ssr:sse-' + e.event, {detail: e})
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
      if (error.name != 'AbortError') {
        dispatch($n, 'ssr:fetch-error', {bubbles: true, detail: {q, u, error}})
      }
    }
  }

  function fn(k, $n, v, r = (x) => x) {
    const b = r(v)
      .replace(/\$(\w+)\b/g, 'store.$1')
      .replace(/\@(debounce)\(/g, '__at.$1(__k,el,()=>')
      .replace(/\@(class|delete|get|fetch|listen|post)\(/g, '__at.$1(el,')
      .replace(/\@(\w+)\b/g, '__at.$1')

    try {
      const cb = new Function('el', 'store', '__at', '__k', 'evt', b)
      $n.dataset[k] = b
      return (e) => cb($n, $n._S, at, k, e)
    } catch (error) {
      console.error(error, $n, b)
    }
  }

  function j(i, o = new FormData()) {
    for (const k in i ?? {}) {
      if (!k.startsWith('_')) {
        const v = typeof i[k].values == 'function' ? [...i[k].values()] : i[k]
        o.append(k, JSON.stringify(v).replace(/^"|"$/g, ''))
      }
    }
    return o
  }

  function script($n) {
    const $s = $d.createElement('script')
    ;['nonce', 'textContent'].map((k) => $s[k] = $n[k])
    $d.body.appendChild($s)
    $n.remove()
  }

  listen($d, 'ssr:init', (evt) => {
    $map(evt.target, data_sel, ($n) => {
      if ($n._S) return

      // Create a store
      if ($n.dataset.init) {
        const d = new Set()
        d.render = (k) => {
          d.add(k)
          d._r ??= $w.requestAnimationFrame(() => {
            dispatch($n, 'ssr:render')
            $map($n, data_sel, ($c) => dispatch($c, 'ssr:render'))
            d.clear()
            d.r = true
            delete d._r
          })
        }

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
        fn('init', $n, $n.dataset.init)()
      }

      let [$p, s] = [$n]
      while (!$n._S) {
        if (!$p || $p._S) s = $n._S = $p ? $p._S : {}
        $p = $p?.parentNode
      }

      // Listen for @click and friends
      for (const attr of $n.attributes) {
        const e = attr.name.replace(/^@/, '')
        if (e != attr.name) listen($n, e, fn('on', $n, attr.value))
      }

      // Two way binding
      if ($n.dataset.bind) {
        const k = $n.dataset.bind.replace(/^\s*\$/, '')
        s[k] ??= $n.value

        if ($n.type == 'checkbox' || $n.type == 'radio' || $n.tagName == 'SELECT') {
          listen($n, 'change', () => {
            const b = !$n.hasAttribute('value')
            if (s[k] instanceof Set) {
              s[k][$n.checked ? 'add' : 'delete']($n.value)
              s._D.render(k)
            } else {
              s[k] = $n.checked ? (b ? true : $n.value) : (b ? false : '')
            }
          })
          listen($n, 'ssr:render', () => {
            if (s[k] instanceof Set) {
              $n.checked = s[k].has($n.value)
            } else {
              $n.checked = s[k] === true || s[k] == $n.value // Want to match numbers and strings
            }
          })
        } else {
          listen($n, 'input', () => (s[k] = $n.value))
          listen($n, 'ssr:render', () => $n.value = s[k])
        }
      }

      // Run effects
      if ($n.dataset.effect) {
        const cb = fn('effect', $n, $n.dataset.effect, (x) => {
          const u = x.replaceAll(/@use\(/g, 'store._U(')
          if (u !== x) return u
          const ks = Array.from(x.matchAll(/\$(\w+)(?!\s*=)/g), (m) => `'${m[1]}'`).join(',')
          return `store._U([${ks}])&&(${x})`
        })

        listen($n, 'ssr:render', cb)
      }
    })
  })

  listen($d, 'ssr:fetch-error', (evt) => {
    const d = evt.detail
    setTimeout(() => evt.target.parentNode && fetch(evt.target, d.u, d.q), 3000)
  })

  listen($d, 'ssr:sse-patch-elements', ({detail}) => {
    if (detail.data.lastIndexOf('<body', 2048) !== -1) {
      destroy($d.body, false)
      let [$p, $c] = [new DOMParser().parseFromString(detail.data, 'text/html')]
      if (($c = $q($p, 'body'))) $d.body.innerHTML = $c.innerHTML
      if (($c = $q($p, 'title'))) $map($d, 'title', ($o) => $o.textContent = $c.textContent)
      $map($d, 'script[nonce], style[nonce]', ($c) => $c.remove())
      $map($p, 'script[nonce]', script)
      $map($p, 'style[nonce]', ($c) => $d.head.appendChild($c))
    } else {
      const $p = $d.createRange().createContextualFragment(detail.data)
      $map($p, 'script[nonce]', script)
      $map($p, 'style[nonce]', ($c) => $d.head.appendChild($c))
      for (const $c of $p.children) {
        const swap = ($c.dataset.swap || `replaceWith:#${$c.id}`).split(':', 2)
        const $o = $q($d, swap[1])
        destroy($o, false)
        $o[swap[0]]($c)
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
