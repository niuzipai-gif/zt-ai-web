// One request per real navigation, never a timer or background keep-alive.
// Begin waking the free gateway before downloading and evaluating the app.
export function gatewayWarmup(baseUrl = process.env.VITE_API_BASE_URL) {
  let origin
  try {
    const url = new URL(baseUrl)
    if (url.protocol !== 'https:' || url.username || url.password) return { name: 'gateway-warmup' }
    origin = url.origin
  } catch { return { name: 'gateway-warmup' } }
  const endpoint = JSON.stringify(`${origin}/api/health`).replace(/</g, '\\u003c')
  return {
    name: 'gateway-warmup',
    transformIndexHtml: { order: 'post', handler: () => [
      { tag: 'link', attrs: { rel: 'preconnect', href: origin, crossorigin: 'anonymous' }, injectTo: 'head-prepend' },
      { tag: 'script', children: `(()=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),65000);fetch(${endpoint},{mode:'no-cors',cache:'no-store',credentials:'omit',signal:c.signal}).catch(()=>{}).finally(()=>clearTimeout(t))})()`, injectTo: 'head-prepend' },
    ] },
  }
}
