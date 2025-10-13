;(function ($w, $d) {
  const data_sel = '[data-init], [data-bind], [data-effect]'
  const dispatch = ($n, e, o = {}) => $n.dispatchEvent(new CustomEvent(e, {bubbles: false, ...o}))
  const $map = ($p, s, cb) => [].map.call($p.querySelectorAll(s), cb)
  const $q = ($p, s) => $p.querySelector(s)

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
    })
  })

  listen($d.body, 'click', () => {
  })

  listen($w, 'popstate', () => {
  })

  dispatch($d, 'ssr:init')
})(window, document)
