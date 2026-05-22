// Use relative URL — proxied through Next.js to avoid CORS issues
const BASE = '/api'

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('wac_token')
}

async function request(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  get: (path: string) => request('GET', path),
  post: (path: string, body: any) => request('POST', path, body),
  put: (path: string, body: any) => request('PUT', path, body),
  patch: (path: string, body: any) => request('PATCH', path, body),
  delete: (path: string) => request('DELETE', path),
}
