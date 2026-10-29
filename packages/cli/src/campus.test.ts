import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { calendar, progress, notifications, forums, forumDiscussions, forumView } from './campus.js';

const token = 'a'.repeat(32);
function fixture(t: TestContext, responses: Record<string, unknown>) {
  const calls: { method: string; params: URLSearchParams }[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, options?: RequestInit) => {
    assert.ok(options?.body instanceof URLSearchParams);
    const method = options.body.get('wsfunction') ?? '';
    assert.ok(method in responses, `Unexpected API: ${method}`);
    assert.doesNotMatch(method, /start|save|submit|mark|view_forum/);
    calls.push({ method, params: options.body });
    return new Response(JSON.stringify(responses[method]));
  });
  return calls;
}

test('calendar includes enrolled course events in a 14-day window and sorts them', async t => {
  const now = Math.floor(Date.now() / 1000);
  const calls = fixture(t, {
    core_webservice_get_site_info: { userid: 7 },
    core_enrol_get_users_courses: [{ id: 12, fullname: 'Algorithms' }],
    core_calendar_get_calendar_events: { events: [
      { id: 2, name: 'Later', courseid: 12, timestart: now + 3600 },
      { id: 1, name: 'Soon', courseid: 0, timestart: now + 60 },
      { id: 3, name: 'Outside', courseid: 12, timestart: now + 20 * 86400 },
    ], warnings: [] },
  });
  const result = await calendar(token);
  assert.deepEqual(result.events.map(event => event.id), [1, 2]);
  const params = calls.at(-1)?.params;
  assert.equal(params?.get('events[courseids][0]'), '12');
  assert.equal(params?.get('options[userevents]'), '1');
  assert.equal(result.days, 14);
});

test('progress joins activity names and counts visible tracked completion only', async t => {
  const calls = fixture(t, {
    core_webservice_get_site_info: { userid: 7 },
    core_completion_get_activities_completion_status: { statuses: [
      { cmid: 42, state: 1, hascompletion: true, uservisible: true },
      { cmid: 43, state: 0, hascompletion: true, uservisible: true },
      { cmid: 44, state: 1, hascompletion: false },
    ], warnings: [] },
    core_course_get_contents: [{ id: 1, name: 'Week 1', modules: [
      { id: 42, name: 'Long Vietnamese title', modname: 'assign', url: 'https://courses.fit.hcmus.edu.vn/mod/assign/view.php?id=42' },
      { id: 43, name: 'Quiz', modname: 'quiz' },
    ] }],
  });
  const result = await progress(token, 12);
  assert.equal(result.completed, 1);
  assert.equal(result.total, 2);
  assert.equal(result.activities[0].name, 'Long Vietnamese title');
  assert.equal(calls.find(call => call.method === 'core_completion_get_activities_completion_status')?.params.get('userid'), '7');
});

test('notifications keep unread count, render text, and reject off-site context URLs', async t => {
  const calls = fixture(t, { message_popup_get_popup_notifications: { unreadcount: 3,
    notifications: [{ id: 1, subject: 'Điểm mới', fullmessagehtml: '<p>Đã chấm</p>', read: false,
      contexturl: 'https://outside.example/path', timecreated: 100 }] } });
  const result = await notifications(token, 5);
  assert.equal(result.unreadcount, 3);
  assert.equal(result.notifications[0].messageText, 'Đã chấm');
  assert.match(result.notifications[0].webUrl, /courses\.fit\.hcmus\.edu\.vn/);
  assert.equal(calls[0].params.get('limit'), '5');
});

test('forum list, paged discussions and posts use read-only APIs and preserve content', async t => {
  const calls = fixture(t, {
    mod_forum_get_forums_by_courses: [{ id: 8, course: 12, name: 'Q&A', type: 'general', cmid: 80, intro: '<p>Ask here</p>' }],
    mod_forum_get_forum_discussions: { discussions: [{ id: 10, discussion: 11, subject: 'Help', message: '<p>Question</p>', numreplies: 2 }], warnings: [] },
    mod_forum_get_discussion_posts: { forumid: 8, courseid: 12, posts: [{ id: 10, subject: 'Help', message: '<p>Answer</p>', author: { fullname: 'Teacher' } }], warnings: [] },
  });
  assert.equal((await forums(token, 12)).forums[0].introText, 'Ask here');
  const topics = await forumDiscussions(token, 8, 2);
  assert.equal(topics.discussions[0].messageText, 'Question');
  assert.equal(calls[1].params.get('page'), '1');
  assert.equal((await forumView(token, 11)).posts[0].messageText, 'Answer');
  assert.deepEqual(calls.map(call => call.method), [
    'mod_forum_get_forums_by_courses', 'mod_forum_get_forum_discussions', 'mod_forum_get_discussion_posts']);
});

test('invalid options fail before contacting Moodle', async t => {
  const calls = fixture(t, {});
  await assert.rejects(calendar(token, undefined, 366), /365/);
  await assert.rejects(progress(token, '1e2'), /ID/);
  await assert.rejects(notifications(token, 101), /100/);
  await assert.rejects(forumDiscussions(token, 8, 0), /nguyên dương/);
  assert.equal(calls.length, 0);
});
