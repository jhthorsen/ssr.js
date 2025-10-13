;(function ($w, $d) {
  const data_sel = '[data-init], [data-bind], [data-effect]'
  const dispatch = ($n, e, o = {}) => $n.dispatchEvent(new CustomEvent(e, {bubbles: false, ...o}))
  const $map = ($p, s, cb) => [].map.call($p.querySelectorAll(s), cb)
  const $q = ($p, s) => $p.querySelector(s)

  const at = {
    map: $map,
    q: $q,
    render: R,
    dispatch,
    listen,
  }

  function fn(x, $n, v) {
    const b = v
      .replace(/\@(\w+)\(/g, '__at.$1(')
      .replace(/\$(\w+)/g, 'store.$1')

    try {
      const s = /\bstore\.\w/.test(b) ? 'TODO' : null
      const cb = new Function('x', 'el', '__at', 'store', 'evt', b)
      return (e) => cb(x, $n, at, s, e)
    } catch (error) {
      console.error({n: $n, b, error})
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
