import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { api, decodeAppToken, SITE } from './moodle.mjs';

const passport = 'test-passport';
const siteId = createHash('md5').update(SITE + passport).digest('hex');
const token = 'a'.repeat(32);
const callback = (value) => `coursecli://token=${Buffer.from(value).toString('base64')}`;

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
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `${SITE}/webservice/rest/server.php`);
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
    assert.match(error.message, /invalidtoken/);
    assert.ok(!error.message.includes(token));
    return true;
  });
});

test('rejects HTTP errors and non-JSON responses without printing response bodies', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(token, { status: 403 }));
  await assert.rejects(api(token, 'core_webservice_get_site_info'), /HTTP 403/);
  globalThis.fetch.mock.mockImplementation(async () => new Response(`<html>${token}</html>`));
  await assert.rejects(api(token, 'core_webservice_get_site_info'), /JSON/);
});
