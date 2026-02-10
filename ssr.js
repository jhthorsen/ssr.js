;(function ($w, $d) {
  const data_sel = '[data-init], [data-bind], [data-effect], [data-store]'
  const S = {}
  const dispatch = ($n, e, o = {}) => $n.dispatchEvent(new CustomEvent(e, {bubbles: false, ...o}))
  const has = Object.hasOwn
  const $ = ($p, s, cb) => !cb ? $p.querySelector(s) : [].map.call($p.querySelectorAll(s), cb)

  const O = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const $n = entry.target
      if (!entry.isIntersecting) continue
      if ($n.getAttribute('on:reveal')) dispatch($n, 'reveal')
      O.unobserve($n)
    }
  })

  const at = {
    debounce: (k, $n, cb, s) => {
      ;($n._T ??= {})[k] && clearTimeout($n._T[k])
      $n._T[k] = setTimeout(cb, s)
    },
    dispatch,
    fetch,
    get: fetch,
    listen,
    post: ($n, u, o = {}) => fetch($n, u, {method: 'POST', ...o}),
    set: ($n, k, i, v) => {
      $n._S[k][i] = v
      $n._S._D.render(k)
    },
  }

  function destroy($n) {
    if ($n.dataset.preserve != undefined) return
    O.unobserve($n)
    $($n, data_sel, destroy)
    for (const k in $n._C ?? {}) for (const c of $n._C[k]) c()
    for (const k in $n._T ?? {}) clearTimeout($n._T[k])
    ;['_C', '_S', '_T'].map((k) => delete $n[k])
  }

  async function fetch($n, u, q = {}) {
    for (const c of ($n._C ??= {})[u] ?? []) c()
    const ac = new AbortController()
    $n._C[u] = [() => ac.abort()]

    const url = new URL(u, location.href)
    if (q.search) j(q.search, url.searchParams)

    const $h = $($d.head, 'meta[name=ssr-headers]')
    const qh = $h ? fn('headers', $h, `return {${$h.content}}`)() : {}
    q.headers = j(qh, q.headers ?? new Headers())

    try {
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
        dispatch($n, 'ssr:fetch-error', {bubbles: true, detail: {q, u, error}})
      }
      if (!q.method || q.method == 'GET') {
        setTimeout(() => $n.parentNode && fetch($n, u, q), 3000)
      }
      return null
    }
  }

  function fn(k, $n, v, r = (x) => x) {
    const b = r(v)
      .replace(/\$(\w+)\b/g, 'store.$1')
      .replace(/\@(debounce)\(/g, '__at.$1(__k,el,()=>')
      .replace(/\@(get|listen|post|set)\(/g, '__at.$1(el,')
      .replace(/\@(dispatch|fetch)\b/g, '__at.$1')

    try {
      const cb = new Function('$', 'el', 'store', '__at', '__k', 'evt', b)
      $n.dataset[k] = b
      return (e) => cb($, $n, $n._S, at, k, e)
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

  function listen($n, $t, e, cb, o = {}) {
    $t.addEventListener(e, cb, o)
    const u = () => {
      $t.removeEventListener(e, cb)
      $n._C[e].delete(u)
    }
    ;(($n._C ??= {})[e] ??= new Set()).add(u)
    return u
  }

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

  listen($w, $d, 'ssr:init', (evt) => {
    $(evt.target, data_sel, ($n) => {
      if ($n._S) return

      // Create a store
      if ($n.dataset.store) {
        const d = new Set()
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
        fn('store', $n, $n.dataset.store)()
      }

      let [$p, s] = [$n]
      while (!$n._S) {
        if (!$p || $p._S) s = $n._S = $p ? $p._S : {}
        $p = $p?.parentNode
      }

      // Run initial code
      if ($n.dataset.init) {
        if ($n.id) S[$n.id] = $n._S
        delete $n._S._D.r
        fn('init', $n, $n.dataset.init)()
      }

      // Listen for on:click, on:reveal and other events
      for (const a of $n.attributes) {
        const e = a.name.replace(/^on:/, '')
        if (e == 'reveal') O.observe($n)
        if (e != a.name) listen($n, $n, e, fn('on', $n, a.value))
      }

      // Two way binding
      if ($n.dataset.bind) {
        const k = $n.dataset.bind.replace(/^\s*\$/, '')
        s[k] ??= $n.type == 'number' ? parseFloat($n.value) : $n.value

        if ($n.type == 'checkbox' || $n.type == 'radio' || $n.tagName == 'SELECT') {
          listen($n, $n, 'change', () => {
            const b = !$n.hasAttribute('value')
            if (s[k] instanceof Set) {
              s[k][$n.checked ? 'add' : 'delete']($n.value)
              s._D.render(k)
            } else {
              s[k] = $n.checked ? (b ? true : $n.value) : (b ? false : '')
            }
          })
          listen($n, $n, 'ssr:render', () => {
            if (s[k] instanceof Set) {
              $n.checked = s[k].has($n.value)
            } else {
              $n.checked = s[k] === true || s[k] == $n.value // Want to match numbers and strings
            }
          })
        } else {
          listen($n, $n, 'input', () => s[k] = typeof s[k] == 'number' ? +$n.value : $n.value)
          listen($n, $n, 'ssr:render', () => $n.value = s[k])
        }
      }

      // Run effects
      if ($n.dataset.effect) {
        const cb = fn('effect', $n, $n.dataset.effect, (x) => {
          const u = x.replaceAll(/@use\(/g, 'store._U(')
          if (u !== x) return u
          const ks = Array.from(x.matchAll(/\$(\w+)\b\s*(?!=)/g), (m) => `'${m[1]}'`).join(',')
          return `if(store._U([${ks}])){${x};}`
        })

        listen($n, $n, 'ssr:render', cb)
      }
    })
  })

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
      for (const $t of $p.children) {
        for (const $c of $t.dataset.template ? $t.querySelectorAll($t.dataset.template) : [$t]) {
          const swap = ($c.dataset.swap || `morph:#${$c.id}`).split(':', 2)
          const $o = $($d, swap[1])
          destroy($o)
          swap[0] == 'morph' ? Idiomorph.morph($o, $c) : $o[swap[0]]($c)
          setTimeout(() => dispatch($o, 'ssr:sse-patched'), 0)
        }
      }
    }

    dispatch($d, 'ssr:init')
  })

  listen($w, $d.body, 'click', (evt) => {
    if (evt.target?.closest('button, input, select, textarea')) return

    const $n = evt.target?.closest('[href]')
    if (!$n || $n.target == '_top') return
    for (const a of $n.attributes) {
      if (a.name == 'on:click') return
    }

    const url = new URL($n.href || $n.getAttribute('href'), location.href)
    if (url.origin !== location.origin) return // external link

    if (location.pathname !== url.pathname || location.search !== url.search) {
      history.pushState({}, null, url.pathname + url.search)
    }

    evt.preventDefault()
    fetch($d.body, url.pathname + url.search, {})
  })

  listen($w, $w, 'popstate', () => {
    fetch($d.body, location.href, {})
  })

  if (!$d.body.dataset.store) $d.body.dataset.store = '$root=true'
  dispatch($d, 'ssr:init')
})(window, document)
