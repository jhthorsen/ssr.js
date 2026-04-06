// Usage: deno task start
const port = Deno.env.get('PORT') || 3000
Deno.serve({port}, async (req) => {
  try {
    const path = new URL(req.url).pathname.match(/^\/(\w+\.\w+)$/)
    const body = await Deno.readFile(path ? path[1] : 'index.html')
    const type = path === 'ssr.js' ? 'text/javascript' : path === '404.html' ? '404' : 'text/html'
    return new Response(body, {headers: {'content-type': type + '; charset=utf-8'}})
  } catch {
    return new Response('Not Found', {status: 404})
  }
})

console.log(`Listening on http://localhost:${port}`)
