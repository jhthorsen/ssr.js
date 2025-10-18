# ssr.js

An alternative to [htmx](https://htmx.org) and [datastar](https://data-star.dev).

## Size matter

Bundle size and compilation time matters. Especially on low end hand held devices in rural areas. For example 30k might not sound like much, but why make your user download it, if you can have most of the same features for less?

Each commit messages should contain the latest size, but below is just to give a quick idea of the size of `ssr.js`:

```
$ sed -E 's/^[ ]+//; s/[ ]*\/\/.*//' ssr.js  | wc -c
6783

$ gzip -c ssr.js | wc -c && brotli -c ssr.js | wc -c
3056
2707

$ curl -L https://cdn.jsdelivr.net/gh/starfederation/datastar@1.0.0-RC.5/bundles/datastar.js | wc -c
30643

$ curl https://cdn.jsdelivr.net/npm/htmx.org@2.0.7/dist/htmx.min.js | wc -c
51076
```

Running `ssr.js` through a minifier does not save a lot, but as of today, you can serve a minified version (not even using gzip or brotli) which takes about 5kB!

## Features

### data-init

`data-init` can be used to run any javascript expression when the element is present in the DOM the first time. All the `@x()` functions below are available, and you can also define reactive variables using the `$myVariable=...` syntax.

```html
<div data-init="anyJavaScriptExpression()"/>
<div data-init="$a=42;"/>
```

### data-init and @event

Events such as `@click` can be listened to and the expression inside quotes will be run on the event. All the `@x()` functions below are available, and you can also change any reactive variables.

```html
<!-- The data-init attribute is required for ssr.js to discover this element! -->
<button data-init @click="anyJavaScriptExpression(evt)">click me</button>
```

### data-bind

Two-way bindings are available by setting `data-bind`. The variable defined will affect the element when changed, and will get updated when the input is interacted with.

```html
<!-- The "$" prefix is optional -->
<input data-bind="$a">
<input data-bind="a">
<input data-bind="a" data-effect="@use(['a']) && @debounce(someCallback, 200)">
<div data-init="$x=new Set()">
  <input type="checkbox" data-bind="$x" value="42"/>
  <input type="checkbox" data-bind="$x" value="24"/>
</div>
```

### data-effect

The `data-effect` expression will be called when any variable inside is changed, or [@use](#%40use) can used to specify which variables to watch.

```html
<div data-init="$a=4">
  <!-- binds to whenever $a changes -->
  <input type="text" data-effect="@use(['a']) && alert($a)" @input="$a=evt.value.toUpperCase()"/>
  <!-- same, but does so by looking at the expression -->
  <!-- the variable names cannot be prefixed with "$"! -->
  <input type="text" data-effect="alert($a)" @input="$a=evt.value.toUpperCase()"/>
</div>
```

### data-preserve

Adding `data-preserve` to an element will keep that element around after a swap. This is useful for a loading indicator or an element that keeps historical notifications.

### data-init, data-effect and @event syntax and variables

There are some special syntax and variables in data-init, data-effect and @event:

* `el` - The current DOM node.
* `store` - A `Proxy` object which contains all the variables, but without the "$" prefix.
* `evt` - The current `event`, inside `@event` handlers.
* `$foo` - Any variable prefixed with "$" will access a key inside the `store`.
* `@foo` - Any of the "@" functions listed below are available.

### @class

The `@class` function is a shorthand for `el.classList.toggle()`.

```html
<div data-init="$x=true">
  <div data-init data-effect="@class({'some-class: $x})"/>
</div>
```

### @delete

Issues a DELETE request using `window.fetch()` See [@get](#%40get).

### @debounce

Used to debounce a function.

```html
<input data-init @keyup="@debounce(alert(el.varlue), 500)"/>
```

### @destroy

Should be used instead of `el.remove()`, since it also cleans up internal state.

```html
<button data-init @click="@remove(el)">remove me</button>
```

### @dispatch

Shorthand for `element.dispatchEvent(new CustomEvent(eventName, {bubbles: false, ...options}))`.

```html
<button data-init @mouseover="@dispatch(window, 'some-interaction')">remove me</button>
<button data-init @mouseover="@dispatch(el, 'some-interaction', {bubbles: true})">remove me</button>
<button data-init @mouseover="@dispatch(el, 'some-interaction', {detail: {foo:42}})">remove me</button>
```

### @get

Issues a GET request or any other request type specified. Will by default pass on every variable in the query string.

```html
<button data-init @click="@get('/foo/bar')">like a link</button>
<button data-init @click="@get('/foo/bar', {method: 'PATCH'})">custom method</button>
<button data-init @click="@get('/foo/bar', {search: {}})">don't send any variables</button>
<button data-init @click="@post('/foo/bar', {search: {}, body: @j(store)})">send a form request</button>
```

### @listen

Shorthand for `element.addEventListener(eventName, callback, {signal, ...options})`, but the listener will be automatically cleaned up when [@destroy](#%40destroy) is called.

```html
<div data-init="@listen(window, 'keyup', (evt) => handleKeyUp(evt, el, store))"/>
```

### @map

Shorthand for `[].map.call(node.querySelectorAll(selector), callback)`.

```html
<div data-init="@map(el, 'a[href]' (c) => c.classList.add('link'))">
```

### @post

Issues a POST request using `window.fetch()` See [@get](#%40get).

### @q

Shorthand for `node.querySelector(selector)`.

```html
<div data-init="@q(el, 'a[href]')?.click())">
```

### @use

See [data-effect](#data-effect).

### Document event `ssr:init`

The `ssr:init` event is trigger on inital load or when a fetch request is done. It will look for elements with `data-init`, `data-bind` or `data-effect` attributes and initialize them.

Already initialized elements will be skipped.

### Document event `ssr:fetch-error`

The `ssr:fetch-error` event is triggered when `window.fetch()` fails.

### Document event `ssr:sse-patch-elements`

The `ssr:sse-patch-elements` event is triggered when `window.fetch()` sees a `text/html` response or a `sse-patch-elements` event is received from a `text/event-stream` response.

### Document body event `click`

Clicking on relative links will trigger a `window.fetch()` request which again triggers `ssr:sse-patch-elements`. The exception is if the link has `target="_top"` or `@click` set.

```html
<a href="/foo">load with fetch()</a>
<a href="/foo" target="_top">take over</a>
<a href="/foo" data-init @click="...">ignored</a>
```

### Window event `popstate`

Will trigger a `window.fetch()` request and triggers `ssr:sse-patch-elements`.

### Handling of script and style elements

`<script>` and `<style>` tags from `window.fetch()` responses are inserted into the current document, if the contain a `nonce` attribute.

```html
<!-- initially loaded document -->
<head>
  <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-eval' 'nonce-RandomString'">
</head>

<!-- tags loaded later on -->
<style nonce="RandomString">...</style>
<script nonce="RandomString">...</script>
```

### text/event-stream

`text/event-stream` responses like the one below are handled. `data` can span multiple lines.

```
<!-- will replace a node in the document -->
event: patch-elements
data: <div id="some_id"></div>

<!-- will append or prepend a node in the document -->
event: patch-elements
data: <div data-swap="append:#some_id"></div>

event: patch-elements
data: <div data-swap="prepend:#some_id"></div>
```

### text/html

`text/html` responses will trigger the same logic as for `text/event-stream`.

### application/json

TODO: Need to handle application/json, which can be used to patch client side variables.

### ssr-headers

A meta tag can be defined in `head` to send default headers. Note that no special headers are sent by default.

```html
<head>
  <meta name="ssr-headers" content="'x-nonce':'RandomString'">
</head>
```

## Comparison

### Datastar: data-attr

```html
<div data-init data-effect="el.someAttr=$foo"/>
```

### Datastar: data-bind

See [data-bind](#data-bind)

### Datastar: data-class

See [@class](#%40class)

### Datastar: data-computed

```html
<div data-init="$a=4;$b=$a*2">
  <input type="text" data-effect="$b=$a*2"/>
</div>
```

### Datastar: data-effect

See [data-bind](#data-effect)

### Datastar: data-on

```html
<div data-init="$a=42">
  <button type="button" @click="alert($a)">
  <button type="button" @click="@debounce(alert($a), 500)">
  <button type="button" data-init="@listen(window, 'keyup', (evt) => alert(evt.key))">
  <button type="button" data-init="@listen(el, 'click', () => alert($a), {capture: true})">
  <button type="button" data-init="@listen(el, 'click', () => alert($a), {once: true})">
  <button type="button" data-init="@listen(el, 'click', () => alert($a), {passive: true})">
</div>
```

TODO: Need to add shortcut for `evt.preventDefult()`.

### Datastar: data-on-load

```html
<div data-init="..."/>
```

### Datastar: data-show

```html
<style>
[hidden] { display: none !important }
</style>
<div data-effect="el.hidden=!$show"/>
```

### Datastar: data-signals

Note that `data-init="..."` will create a new store, and the variables are not inherited. This is currently a feature, but `data-inherit` (or something) might be added in the future.

```html
<div data-init="$a=42;$b=false">
  <div data-init="$c=1">
    <!-- $a and $b are not available here -->
  </div>
</div>
```

### Datastar: data-style

```html
<div data-effect="el.style.background=$b"/>
```

### Datastar: data-text

```html
<div data-init="$a='hello world'>
  <b data-effect="el.textContent=$a"/>
</div>
```

## Not planned

The following features in datastar are not planned, either because of complexity or narrow usecases:

* [data-animate](https://data-star.dev/reference/attributes#data-animate)
* [data-custom-validity](https://data-star.dev/reference/attributes#data-custom-validity)
* [data-ignore](https://data-star.dev/reference/attributes#data-ignore)
* [data-ignore-morph](https://data-star.dev/reference/attributes#data-ignore-morph)
* [data-json-signals](https://data-star.dev/reference/attributes#data-json-signals)
* [data-on-intersect](https://data-star.dev/reference/attributes#data-on-intersect)
* [data-on-interval](https://data-star.dev/reference/attributes#data-on-interval)
* [data-on-resize](https://data-star.dev/reference/attributes#data-on-resize)
* [data-on-signal-patch-filter](https://data-star.dev/reference/attributes#data-on-signal-patch-filter)
* [data-query-string](https://data-star.dev/reference/attributes#data-query-string)
* [data-ref](https://data-star.dev/reference/attributes#data-ref)

## TODO

The following datastar features will probably be implemented in the future:

* [data-indicator](https://data-star.dev/reference/attributes#data-indicator)
* [data-on-raf](https://data-star.dev/reference/attributes#data-on-raf)
* [data-on-signal-patch](https://data-star.dev/reference/attributes#data-on-signal-patch)
* [data-persist](https://data-star.dev/reference/attributes#data-persist)
* [data-preserve-attr](https://data-star.dev/reference/attributes#data-preserve-attr)
* [data-replace-url](https://data-star.dev/reference/attributes#data-replace-url)
* [data-scroll-into-view](https://data-star.dev/reference/attributes#data-scroll-into-view)
* [data-view-transition](https://data-star.dev/reference/attributes#data-view-transition)

## Copyright

Jan Henning Thorsen
