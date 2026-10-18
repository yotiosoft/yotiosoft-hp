const ALLOWED_ORIGINS = new Set(['https://yotiosoft.com', 'https://www.yotiosoft.com']);
const STATICFORMS_URL = 'https://api.staticforms.xyz/submit';

function respond(message, status, origin) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (!ALLOWED_ORIGINS.has(origin)) return new Response('Forbidden', { status: 403 });
    if (new URL(request.url).pathname !== '/contact') return respond('Not found', 404, origin);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST',
          'Vary': 'Origin',
        },
      });
    }
    if (request.method !== 'POST') return respond('Method not allowed', 405, origin);
    if (Number(request.headers.get('Content-Length')) > 20000) return respond('Request too large', 413, origin);

    let form;
    try {
      form = await request.formData();
    } catch {
      return respond('Invalid form data', 400, origin);
    }
    const name = String(form.get('name') || '').trim();
    const email = String(form.get('email') || '').trim();
    const subject = String(form.get('subject') || '').trim();
    const message = String(form.get('message') || '').trim();
    const token = String(form.get('cf-turnstile-response') || '');
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        !subject || subject.length > 150 || !message || message.length > 10000 || !token) {
      return respond('Invalid form fields', 400, origin);
    }
    if (!env.STATICFORMS_ACCESS_KEY || !env.TURNSTILE_SECRET_KEY) {
      return respond('Service unavailable', 503, origin);
    }

    try {
      const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET_KEY,
          response: token,
          remoteip: request.headers.get('CF-Connecting-IP') || '',
        }),
      });
      if (!verification.ok) return respond('Verification unavailable', 503, origin);
      const result = await verification.json();
      if (!result.success || !['yotiosoft.com', 'www.yotiosoft.com'].includes(result.hostname)) {
        return respond('Verification failed', 403, origin);
      }

      const upstream = await fetch(STATICFORMS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          accessKey: env.STATICFORMS_ACCESS_KEY,
          name,
          email,
          subject,
          message,
          replyTo: 'contact@yotio.jp',
        }),
      });
      if (!upstream.ok) return respond('Submission failed', 502, origin);
      const submissionResult = await upstream.json();
      if (submissionResult.success !== true) return respond('Submission failed', 502, origin);
      return respond('Sent', 200, origin);
    } catch (error) {
      console.error('Contact form submission failed', error);
      return respond('Submission failed', 502, origin);
    }
  },
};
