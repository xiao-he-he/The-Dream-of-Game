// Cloudflare Worker — GitHub OAuth 代理
// 部署: npx wrangler deploy (免费, 无需信用卡)

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    const url = new URL(request.url);

    // POST /token → GitHub OAuth token exchange
    if (url.pathname === '/token' && request.method === 'POST') {
      const body = await request.text();
      const ghRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body
      });
      const data = await ghRes.text();
      return new Response(data, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return new Response('TDG OAuth Proxy — POST /token', {
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
};
