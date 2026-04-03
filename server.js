// Usage: deno task start
Deno.serve({port: Deno.env.get('PORT') || 3000}, async (req) => {
  try {
    const url = new URL(req.url)
    const path = url.pathname === '/ssr.js' ? 'ssr.js' : 'index.html'
    const body = await Deno.readFile(path)
    const type = path === 'ssr.js' ? 'text/javascript' : 'text/html'
    return new Response(body, {headers: {'content-type': type + '; charset=utf-8'}})
  } catch {
    return new Response('Not Found', {status: 404})
  }
})

console.log('Listening on http://localhost:8000')
