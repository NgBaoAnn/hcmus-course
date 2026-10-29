import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { api, decodeAppToken, SITE } from './moodle.js';

const passport = 'test-passport';
const siteId = createHash('md5').update(SITE + passport).digest('hex');
const token = 'a'.repeat(32);
const callback = (value: string) => `coursecli://token=${Buffer.from(value).toString('base64')}`;

test('accepts a token bound to this login and discards the private token', () => {
  assert.equal(decodeAppToken(callback(`${siteId}:::${token}:::private`), passport), token);
  assert.equal(decodeAppToken(callback(`${siteId}:::${token}`), passport), token);
});

test('rejects another login, malformed tokens and unexpected callback schemes', () => {
  for (const value of [
    callback(`${'b'.repeat(32)}:::${token}`),
    callback(`${siteId}:::invalid`),
    callback(`${siteId}:::${token}:::private:::extra`),
    'coursecli://token=!!!',
    callback(`${siteId}:::${token}`).replace('coursecli:', 'https:'),
  ]) {
    assert.throws(() => decodeAppToken(value, passport), /không hợp lệ/);
  }
});

test('sends the token in a POST body, refuses redirects and reads JSON', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    assert.equal(url, `${SITE}/webservice/rest/server.php`);
    assert.ok(options?.body instanceof URLSearchParams);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('wstoken'), token);
    assert.equal(options.body.get('wsfunction'), 'mod_assign_get_assignments');
    assert.equal(options.body.get('courseids[0]'), '12');
    return new Response(JSON.stringify({ courses: [] }));
  });
  assert.deepEqual(await api(token, 'mod_assign_get_assignments', { 'courseids[0]': 12 }), { courses: [] });
});

test('reports API rejection without exposing the token', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    exception: 'moodle_exception', errorcode: 'invalidtoken', message: `Secret ${token}`,
  })));
  await assert.rejects(api(token, 'core_webservice_get_site_info'), (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /invalidtoken/);
    assert.ok(!error.message.includes(token));
    return true;
  });
});

test('rejects HTTP errors and non-JSON responses without printing response bodies', async (t) => {
  const mocked = t.mock.method(globalThis, 'fetch', async () => new Response(token, { status: 403 }));
  await assert.rejects(api(token, 'core_webservice_get_site_info'), /HTTP 403/);
  mocked.mock.mockImplementation(async () => new Response(`<html>${token}</html>`));
  await assert.rejects(api(token, 'core_webservice_get_site_info'), /JSON/);
});

test('REST booleans are encoded as Moodle 1/0 values', async t => {
  let sent: URLSearchParams | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, options?: RequestInit) => {
    assert.ok(options?.body instanceof URLSearchParams);
    sent = options.body;
    return new Response('{}');
  });
  await api(token, 'fixture_boolean_parameters', { enabled: true, disabled: false });
  assert.equal(sent?.get('enabled'), '1');
  assert.equal(sent?.get('disabled'), '0');
});
