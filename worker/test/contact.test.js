import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function submission(fields = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    name: 'Test User', email: 'visitor@example.com', subject: 'Question',
    message: 'Hello', 'cf-turnstile-response': 'token', ...fields,
  })) form.set(key, value);
  return new Request('https://contact.yotiosoft.com/contact', {
    method: 'POST', body: form, headers: { Origin: 'https://yotiosoft.com' },
  });
}

const env = { STATICFORMS_ACCESS_KEY: 'private-test-key', TURNSTILE_SECRET_KEY: 'test' };

test('sends the access key only from the Worker to StaticForms', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let upstreamBody;
  globalThis.fetch = async (url, options) => {
    if (url.includes('siteverify')) return Response.json({ success: true, hostname: 'yotiosoft.com' });
    assert.equal(url, 'https://api.staticforms.xyz/submit');
    upstreamBody = new URLSearchParams(options.body);
    return Response.json({ success: true });
  };
  const response = await worker.fetch(submission({ accessKey: 'attacker-key' }), env);
  assert.equal(response.status, 200);
  assert.equal(upstreamBody.get('accessKey'), 'private-test-key');
  assert.equal(upstreamBody.get('email'), 'visitor@example.com');
  assert.equal(upstreamBody.get('replyTo'), 'contact@yotio.jp');
});

test('failed Turnstile validation never calls StaticForms', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ success: false }); };
  const response = await worker.fetch(submission(), env);
  assert.equal(response.status, 403);
  assert.equal(calls, 1);
});

test('StaticForms rejection is not shown as success', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => url.includes('siteverify')
    ? Response.json({ success: true, hostname: 'yotiosoft.com' })
    : Response.json({ success: false });
  assert.equal((await worker.fetch(submission(), env)).status, 502);
});
