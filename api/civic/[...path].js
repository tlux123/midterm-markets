function buildTargetUrl(base, pathParam, query) {
  const rawParts = Array.isArray(pathParam)
    ? pathParam
    : pathParam
      ? String(pathParam).split('/')
      : [];
  const parts = rawParts
    .flatMap((p) => String(p).split('/'))
    .map((p) => p.trim())
    .filter(Boolean);
  const encodedPath = parts.map((p) => encodeURIComponent(String(p))).join('/');
  const url = new URL(`${base}/${encodedPath}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (key === 'path' || value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, String(v));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export default async function handler(req, res) {
  const url = buildTargetUrl('https://civicapi.org', req.query?.path, req.query);
  const headers = {};
  if (req.headers.accept) headers.accept = req.headers.accept;
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];

  const method = req.method || 'GET';
  const init = { method, headers };
  if (method !== 'GET' && method !== 'HEAD' && req.body != null) {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  const upstream = await fetch(url, init);
  const body = await upstream.text();
  const contentType = upstream.headers.get('content-type');
  if (contentType) res.setHeader('content-type', contentType);
  res.setHeader('cache-control', 'public, s-maxage=300, stale-while-revalidate=300');
  return res.status(upstream.status).send(body);
}
