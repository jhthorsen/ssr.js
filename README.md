```
 ___ ___ _ __ _ ___
/ __/ __| '__| / __|
\__ \__ \ |_ | \__ \
|___/___/_(_)| |___/
            _/ |
           |__/
```

[ssr.js](https://htmlpreview.github.io/?https://github.com/jhthorsen/ssr.js/blob/main/index.html) is an alternative to [htmx](https://htmx.org) and [datastar](https://data-star.dev), which provides many if the same features, but focuses on being plug&play, instead of needing to add a bunch of `x-` or `data-` attributes for the most common cases. Pairing ssr.js with [pico.css](https://picocss.com/) will make your html very clean and easy to work with.

This project is especially suitable for backend developers, that does not want to maintain a big full stack node.js framework, but still want to add some interactivity to their server rendered pages without writing a lot of JavaScript. Full stack and frontend developers can also benefit from the simplicity and hackability of ssr.js, making it suit their specific needs, without all the extra bloat.

<ul>
  <li><a href="https://htmlpreview.github.io/?https://github.com/jhthorsen/ssr.js/blob/main/index.html">Demo</a></li>
  <li><a href="#size-matter">Size matter</a></li>
  <li><a href="#usage">Usage</a></li>
  <li><a href="#data-attributes">Data-attributes</a></li>
  <li><a href="#at-functions">At-functions - @foo()</a></li>
  <li><a href="#events">Events</a></li>
  <li><a href="#server-side-responses">Server side responses</a></li>
  <li><a href="#special-tags">Special tags</a></li>
  <li><a href="#comparison-with-datastar">Comparison with datastar</a></li>
  <li><a href="#copyright">Copyright</a></li>
</ul>

## Size matter

Bundle size and compilation time matters. Especially on low end hand held devices in rural areas. For example 30k might not sound like much, but why make your user download it, if you can have most of the same features for less?

Each commit messages should contain the latest size, but below is just to give a quick idea of the size of `ssr.js`:

```sh
# ssr.js
$ sed -E s:.*// .*$::; s:^[ ]*/?\*.*::g; s:^[ ]*:: ssr.js
     261    1270    8559
$ gzip -ck9 -
    3345
$ brotli -ckq 6 -
    3178
$ uglifyjs -m properties,toplevel ssr.js
    3015
$ uglifyjs -m properties,toplevel ssr.js
    2840

# datastar and htmx
$ curl -L https://cdn.jsdelivr.net/gh/starfederation/datastar@1.0.0-RC.5/bundles/datastar.js | wc -c
   30643
$ curl https://cdn.jsdelivr.net/npm/htmx.org@2.0.7/dist/htmx.min.js | wc -c
   51076
```

## Usage

### Quick start

Place one of the following `<script>` tags before the closing `</body>` tag, or somewhere at the end of you markup.

```html
<!-- The "main" branch can have breaking changes -->
<script src="https://cdn.jsdelivr.net/gh/jhthorsen/ssr.js@main/ssr.js"></script>
<!-- Instead a given stable commit can be used -->
<script src="https://cdn.jsdelivr.net/gh/jhthorsen/ssr.js@e75a1a770af68040aa546cbd36fad35265ff954e/ssr.js"></script>
```

### Idiomorph

[Idiomorph](https://github.com/bigskysoftware/idiomorph) is a JavaScript library for morphing one DOM tree to another. It makes replacing nodes slower, but it makes the user experience much better: For example, text selection and focused input are remembered.

```html
<!-- Make sure you are using the correct version of idiomorph -->
<script src="https://unpkg.com/idiomorph@0.7.4"></script>
<script src="https://cdn.jsdelivr.net/gh/jhthorsen/ssr.js@main/ssr.js"></script>
```

## Data-attributes

There are some special syntax and variables for the attribute below that can run JavaScript expressions:

* `el` - The current DOM node.
* `store` - A `Proxy` object which contains all the variables, but without the "$" prefix.
* `evt` - The current `event`, inside `on:event` handlers.
* `$foo` - Any variable prefixed with "$" will access a key inside the `store`.
* `@foo()` - Any of the "@" functions listed below are available.
* `$()` - DOM node selector utility. Will use querySelectorAll() if a callback is provided, otherwise querySelector().

### data-store

`data-store` creates a new isolated reactive store for an element and its children. The value is JavaScript code that initializes the store using the `$variable=...` syntax. Elements without `data-store` inherit the nearest ancestor's store and the `body` element always has a store that is persisted between swaps. In many cases, this is all you need, if you have good variable names. The store will persist between swaps, if the element also has an `id` attribute, meaning you have to reset variables in `data-init` if that is desired.

Reactive variables *must* be defined in either `data-store` or `data-init`. Trying to define a reactive variable later on, will result in an error.

```html
<div data-store="$count=0; $name='world'"></div>
```

### data-init

`data-init` can be used to run any javascript expression when the element is inserted into the DOM the first time.

```html
<div data-init="anyJavaScriptExpression()"/>
<div data-init="$a=42;"/>
```

### data-bind

Two-way bindings are available by setting `data-bind`. The variable defined will affect the element when changed, and will get updated when the input is interacted with.

```html
<input data-bind="$a">
<div data-store="$x=new Set()">
  <input type="checkbox" data-bind="$x" value="42"/>
  <input type="checkbox" data-bind="$x" value="24"/>
</div>
```

### data-effect

The `data-effect` expression will be called when any variable inside is changed. Note that `data-effect` expressions with side effects (`$a+=2`) are not fully supported, though it works in many cases.

```html
<div data-store="$a=4">
  <!-- same, but does so by looking at the expression -->
  <!-- the variable names cannot be prefixed with "$"! -->
  <input type="text" data-effect="alert($a)" on:input="$a=evt.value.toUpperCase()"/>
</div>
```

### data-history

A `data-history` attribute can be set on `a[href]` or `form` elements to specify if the location bar should be updated on `click` or `submit`.

* `data-history="pushState"` - This is the default value, if the attribute is not present.
* `data-history="replaceState"` - Will replace the current URL.
* `data-history="none"` - Will prevent `history.pushState()` from being called.

### data-preserve

Adding `data-preserve` to an element will prevent its internal state from being destroyed during a swap, and it will be restored into the new document after a full-page (`<body>`) swap. Use `data-preserve="always"` to also restore it during fragment swaps.

```html
<!-- Preserved across full-page swaps -->
<div id="notifications" data-preserve></div>

<!-- Preserved across both full-page and fragment swaps -->
<div id="sidebar" data-preserve="always"></div>
```

### data-swap

One of the main functionalities in ssr.js is to swap DOM nodes that are retrieved from the server. Here are the main "plug&play" rules, that does not require `data-swap`:

1. A complete document is identified by having a `<body>` tag in the response. If such a tag is seen, then the current `<title>` is replaced and the whole document is swapped out.
2. In other cases, the main rule is to replace any existing element that has an `id` attribute matching the `id` attribute of any direct child node in the response.
3. `<script>` and `<style>` tags are always moved into the document `<head>`. Their [`nonce`](#nonce) attribute is preserved if present, which is useful for Content Security Policy.

Any element in the response containing a `data-swap` attribute will be handled before swapping other child elements, and the complete `<body>` will *not* be replaced, if an element with `data-swap` is found. The `data-swap` attribute follows these rules:

* `data-swap="none"` - Ignore this element.
* `data-swap="morph:selector"` - Use [Idiomorph](https://github.com/bigskysoftware/idiomorph) to replace the element.
* `data-swap="replaceWith:selector"` - Replace the element with standard [DOM operation](https://developer.mozilla.org/en-US/docs/Web/API/Element/replaceWith).
* `data-swap="append:selector"` - Append the element with standard [DOM operation](https://developer.mozilla.org/en-US/docs/Web/API/Element/append).
* `data-swap="prepend:selector"` - Prepend the element with standard [DOM operation](https://developer.mozilla.org/en-US/docs/Web/API/Element/prepend).
* `data-swap="before:selector"` - Insert the element before with standard [DOM operation](https://developer.mozilla.org/en-US/docs/Web/API/Element/before).
* `data-swap="after:selector"` - Insert the element after with standard [DOM operation](https://developer.mozilla.org/en-US/docs/Web/API/Element/after).
* `data-swap="remove:selector"` - Remove the element with standard [DOM operation](https://developer.mozilla.org/en-US/docs/Web/API/Element/remove).

The `selector` part above is passed on to `querySelector()` and follows standard CSS selector rules.

Elements such as `<tr>` can't be parsed directly by JavaScript, so to work with partial rows, you need to wrap the element or elements inside a `<table>` element. Example:

```html
<table data-swap="none"><!-- The table element will be ignored -->
  <tr data-swap="append:#my-table tbody">...</tr><!-- The table row will be appended -->
</table>
```

Here is a partial response example, where the `id` will target an existing element in the current DOM tree:

```html
<div id="any-valid-id">...</div>
<div id="some-other-valid-id">...</div>
```

And here is a complete response example:

```html
<html>
<head>
  <title>Will replace existing title</title>
</head>
<body class="will-replace-existing">
  And content will replace existing.
</body>
</html>
```

### data-type

Adding `data-type="number"` to an element will force the type to be a number before placing the value into the store.

```html
<select data-type="number">...</select>
```

ssr.js:dataset.swap
ssr.js:dataset.template
ssr.js:dataset.type

### nonce

The `nonce` attribute is required for `script` and `style` tags to allow swapping in fragments. Example:

```html
<!-- initially loaded document -->
<head>
  <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-eval' 'nonce-rAQLAX4qhdYZ'">
</head>

<!-- tags loaded later on (nonce preserved if set) -->
<style nonce="rAQLAX4qhdYZ">...</style>
<script nonce="rAQLAX4qhdYZ">...</script>
```

## At-functions

### @debounce

Used to debounce a function.

```html
<input data-init on:keyup="@debounce(alert(el.value), 500)"/>
```

### @dispatch

Shorthand for `element.dispatchEvent(new CustomEvent(eventName, {bubbles: false, ...options}))`.

```html
<button data-init on:mouseover="@dispatch(window, 'some-interaction')">hover me</button>
<button data-init on:mouseover="@dispatch(el, 'some-interaction', {bubbles: true})">hover me</button>
<button data-init on:mouseover="@dispatch(el, 'some-interaction', {detail: {foo:42}})">hover me</button>
```

### @get and @post

Issues a GET or POST request or any other request type specified. Will by default pass on every variable in the query string.

```html
<button data-init on:click="@get('/foo/bar')">like a link</button>
<button data-init on:click="@get('/foo/bar', {method: 'PATCH'})">custom method</button>
<button data-init on:click="@get('/foo/bar', {search: {}})">don't send any variables</button>
<button data-init on:click="@post('/foo/bar', {search: {}, body: new FormData()})">send a form request</button>
```

### @listen

Shorthand for `element.addEventListener(eventName, callback, options)`, but the listener will be automatically cleaned up when the element is destroyed.

```html
<div data-init="@listen(window, 'keyup', (evt) => handleKeyUp(evt, el, store))"/>
```

### @set

Sets a value at an index in a store array and triggers a re-render.

```html
<div data-store="$items=['a','b','c']">
  <span data-effect="el.textContent = $items[0]"></span>
  <button data-init on:click="@set('items', 0, 'changed')">Change first</button>
</div>
```

## Events

### Any element event

* `bubbles:false`

Events can be listened to using `on:eventname` attributes, but for the `on:eventname` attribute to be discovered, you also need a `data-init` attribute, though it doesn't need to have a value. The `on:eventname` attribute value will be run when the event is triggered.

```html
<button data-init on:click="el.innerHTML = 'you clicked me'">click me</button>
<button data-init on:mouseover="@debounce(alert($a), 500)">click me</button>
<button data-init on:custom::event-name="evt.preventDefault();$a++">click me</button>
```

### Any element event `reveal`

* `bubbles:false`

The `on:reveal` event is a custom event that uses `IntersectionObserver()` to see if the element is in the viewport or not.

```html
<div data-init on:reveal="console.log({reveal: el})">
```

### Any element event `click` and `submit`

* `bubbles:true`

Any `click` or `submit` event that bubles up to the document will trigger a `window.fetch()` request. The following rules apply:

1. Will not trigger if `target="_self"` or another target starting with underscore.
2. Will not trigger if `evt.preventDefault()` is called before reaching the `document`.
4. The location bar will be updated to the URL of the clicked link or form with `action="get"`.

### Any element event `ssr:render`

* `bubbles:false`

TBD: Not sure if this should be public.

### Document event `ssr:init`

* `bubbles:false`

TBD: Not sure if this should be public.

### Any element event `ssr:response`

* `bubbles:true`

When an `fetch()` gets a response that does not match the content types below, the `ssr:response` event is dispatched on the element that triggered the request.

| content-type      | event                  |
|-------------------|------------------------|
| text/html         | ssr:sse-patch-elements |
| application/json  | ssr:sse-message        |
| text/event-stream | ssr:sse-any-event-name |

The event callback receives the following `evt.detail`:

```javascript
{
  response,   // The response object from fetch()
  url: "...", // The request URL
}
```

### Any element event `ssr:sse-patch-elements`

* `bubbles:true`

This event is dispatched when either either `text/html` is received or the `text/event-stream` response sees a `patch-elements` event. The default handler provided by ssr.js will patch the existing document. See [data-swap](#data-swap) for more details.

```javascript
// data and url are strings.
// setting evt.detail.data = '' will prevent the default `ssr:sse-patch-elements` handler from running
document.addEventListener('ssr:sse-patch-elements', ({detail: {data, url}}) => { ... })
```

### Any element event `ssr:sse-message`

* `bubbles:true`

This event is dispatched when either either `application/json` is received or the `text/event-stream` response sees a `message` event. There are no default handler provided by ssr.js for this event.

```javascript
// data and url are strings
document.addEventListener('ssr:sse-message', ({detail: {data, url}}) => { ... })
```

### Any element event `ssr:sse-any-event-name`

* `bubbles:true`

ssr.js has builtin support for `text/event-stream` content-type, and will parse the events and dispatch them with the `ssr:sse-` prefix.

```javascript
// data and url are strings
document.addEventListener('ssr:sse-message', ({detail: {data, url}}) => { ... })
```

```
<!-- will replace a node in the document (matched by id) -->
event: patch-elements
data: <div id="some_id"></div>

<!-- will append or prepend a node in the document -->
event: patch-elements
data: <div data-swap="append:#some_id"></div>

event: patch-elements
data: <div data-swap="prepend:#some_id"></div>

<!-- will replace a node using replaceWith() -->
event: patch-elements
data: <div data-swap="replaceWith:#some_id"></div>

<!-- will morph a node (requires Idiomorph) -->
event: patch-elements
data: <div data-swap="morph:#some_id"></div>

<!-- will skip swapping this element -->
event: patch-elements
data: <div data-swap="none"></div>

<!-- will emit the `ssr:sse-message` event -->
event: message
data: [1,2,3]

<!-- will emit a custom event `ssr:sse-custom-event` -->
event: custom-event
data: Any data
```

### Any element event `ssr:error`

* `bubbles:true`

When an `fetch()` error occurs, the `ssr:error` event is dispatched on the element that triggered the request. The event callback receives the following `evt.detail`:

```javascript
{
    options: {...}, // The options passed to @get() or @post()
    error,          // The fetch() error
    url: "...",     // The request URL, passed to @get() or @post()
}
```

The default handler (attached to `window`) will retry GET requests, unless `evt.preventDefault()` was called.

## Special tags

### ssr-headers

A meta tag can be defined in `head` to send default headers. Note that no special headers are sent by default.

```html
<head>
  <meta name="ssr-headers" content="'x-nonce':'rAQLAX4qhdYZ'">
</head>
```

## Comparison with datastar

The following features in datastar are not planned, either because of complexity or narrow usecases:
[data-animate](https://data-star.dev/reference/attributes#data-animate),
[data-custom-validity](https://data-star.dev/reference/attributes#data-custom-validity),
[data-ignore](https://data-star.dev/reference/attributes#data-ignore),
[data-ignore-morph](https://data-star.dev/reference/attributes#data-ignore-morph),
[data-json-signals](https://data-star.dev/reference/attributes#data-json-signals),
[data-on-intersect](https://data-star.dev/reference/attributes#data-on-intersect),
[data-on-interval](https://data-star.dev/reference/attributes#data-on-interval),
[data-on-resize](https://data-star.dev/reference/attributes#data-on-resize),
[data-on-signal-patch-filter](https://data-star.dev/reference/attributes#data-on-signal-patch-filter),
[data-query-string](https://data-star.dev/reference/attributes#data-query-string) and
[data-ref](https://data-star.dev/reference/attributes#data-ref).

The following datastar features will probably be implemented in the future:
[data-indicator](https://data-star.dev/reference/attributes#data-indicator),
[data-on-raf](https://data-star.dev/reference/attributes#data-on-raf),
[data-on-signal-patch](https://data-star.dev/reference/attributes#data-on-signal-patch),
[data-persist](https://data-star.dev/reference/attributes#data-persist),
[data-preserve-attr](https://data-star.dev/reference/attributes#data-preserve-attr),
[data-replace-url](https://data-star.dev/reference/attributes#data-replace-url),
[data-scroll-into-view](https://data-star.dev/reference/attributes#data-scroll-into-view) and
[data-view-transition](https://data-star.dev/reference/attributes#data-view-transition).

### Datastar: data-attr

```html
<div data-init data-effect="el.someAttr=$foo"/>
```

### Datastar: data-bind

See [data-bind](#data-bind)

### Datastar: data-class

```html
<div data-store="$x=true">
  <div data-init data-effect="el.classList.toggle('some-class', $x)"/>
</div>
```

### Datastar: data-computed

```html
<div data-store="$a=4;$b=0">
  <input type="text" data-effect="$b=$a*2"/>
</div>
```

### Datastar: data-effect

See [data-effect](#data-effect)

### Datastar: data-on

```html
<div data-store="$a=42">
  <button type="button" on:click="alert($a)">
  <button type="button" on:click="@debounce(alert($a), 500)">
  <button type="button" data-init="@listen(window, 'keyup', (evt) => alert(evt.key))">
  <button type="button" data-init="@listen(el, 'click', () => alert($a), {capture: true})">
  <button type="button" data-init="@listen(el, 'click', () => alert($a), {once: true})">
  <button type="button" data-init="@listen(el, 'click', () => alert($a), {passive: true})">
</div>
```

TODO: Need to add shortcut for `evt.preventDefault()`.

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

Note that `data-store="..."` creates a new isolated store. Child elements without their own `data-store` inherit the nearest ancestor's store.

```html
<div data-store="$a=42;$b=false">
  <div data-store="$c=1">
    <!-- $a and $b are not available here, only $c -->
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

## Copyright

Jan Henning Thorsen
