import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materials, downloadMaterial, markCompletion, forumWrite, inbox, conversation,
  sendMessage, markNotification, todos, favouriteCourses, setFavouriteCourse,
  createPersonalEvent, exportCalendar } from './extras.js';

const token = 'a'.repeat(32);
const site = 'https://courses.fit.hcmus.edu.vn';
function fixture(t: TestContext, responses: Record<string, unknown>) {
  const calls: { method: string; params: URLSearchParams }[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, options?: RequestInit) => {
    assert.ok(options?.body instanceof URLSearchParams);
    const method = options.body.get('wsfunction') ?? '';
    assert.ok(method in responses, `Unexpected API: ${method}`);
    calls.push({ method, params: options.body });
    const response = responses[method];
    return new Response(JSON.stringify(typeof response === 'function' ? (response as () => unknown)() : response));
  });
  return calls;
}

test('materials lists Moodle files and rejects external links or duplicate names before download', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'course-materials-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const contents = [{ id: 1, name: 'Week 1', modules: [{ id: 42, name: 'Slides', modname: 'resource', contents: [
    { filename: 'slides.pdf', fileurl: site + '/pluginfile.php/42/slides.pdf?token=secret', filesize: 5 },
  ] }, { id: 43, name: 'External', modname: 'url', contents: [
    { filename: 'Other', fileurl: 'https://outside.example/file' },
  ] }] }];
  const calls = fixture(t, { core_course_get_contents: contents });
  const list = await materials(token, 12);
  assert.equal(list.materials.length, 2);
  assert.equal(list.materials[1].files.length, 0);
  assert.equal(list.materials[0].files.length, 1);
  assert.ok(!JSON.stringify(list).includes('secret'));
  await assert.rejects(downloadMaterial(token, 12, 43, directory), /không có file/);
  assert.equal(calls.length, 2);
  assert.deepEqual(await readdir(directory), []);
});

test('manual completion confirms before write and re-reads state', async t => {
  let state = 0;
  const calls = fixture(t, {
    core_webservice_get_site_info: { userid: 7 },
    core_course_get_contents: [{ id: 1, name: 'Week', modules: [{ id: 42, name: 'Read', modname: 'resource' }] }],
    core_completion_get_activities_completion_status: () => ({ statuses: [{ cmid: 42, state, tracking: 1, hascompletion: true }] }),
    core_completion_update_activity_completion_status_manually: () => { state = 1; return { status: true }; },
  });
  await assert.rejects(markCompletion(token, 12, 42, true, async () => false), /Đã hủy/);
  assert.ok(!calls.some(call => call.method === 'core_completion_update_activity_completion_status_manually'));
  assert.equal((await markCompletion(token, 12, 42, true, async () => true)).state, 'completed');
  assert.equal(calls.find(call => call.method === 'core_completion_update_activity_completion_status_manually')?.params.get('completed'), '1');
});

test('forum create escapes text, reply sends post ID, and subscription uses actual forum ID', async t => {
  const calls = fixture(t, {
    mod_forum_can_add_discussion: { status: true },
    mod_forum_add_discussion: { discussionid: 55, warnings: [] },
    mod_forum_add_discussion_post: { postid: 66, warnings: [] },
    mod_forum_get_discussion_posts: { forumid: 8, courseid: 12, posts: [] },
    mod_forum_set_subscription_state: { id: 55, subscribed: true },
    mod_forum_toggle_favourite_state: { id: 55, favourited: true },
  });
  await assert.rejects(forumWrite(token, 'create', 8, { subject: 'Hi', body: '<script>bad</script>', check: async () => false }), /Đã hủy/);
  assert.ok(!calls.some(call => call.method === 'mod_forum_add_discussion'));
  assert.equal((await forumWrite(token, 'create', 8, { subject: 'Hi', body: '<script>bad</script>', check: async () => true })).id, 55);
  assert.match(calls.find(call => call.method === 'mod_forum_add_discussion')?.params.get('message') ?? '', /&lt;script&gt;/);
  assert.equal((await forumWrite(token, 'reply', 3, { subject: 'Re', body: 'Reply', check: async () => true })).id, 66);
  assert.equal(calls.find(call => call.method === 'mod_forum_add_discussion_post')?.params.get('postid'), '3');
  await forumWrite(token, 'subscribe', 55, { enabled: true, check: async () => true });
  assert.equal(calls.find(call => call.method === 'mod_forum_set_subscription_state')?.params.get('forumid'), '8');
  assert.equal((await forumWrite(token, 'favourite', 55, { enabled: true, check: async () => true })).state, 'enabled');
});

test('messages, notifications, todos and favourites use expected APIs without exposing session URLs', async t => {
  let read = false;
  let favourite = false;
  const calls = fixture(t, {
    core_webservice_get_site_info: { userid: 7 },
    core_message_get_conversations: { conversations: [{ id: 4, name: 'Friend' }] },
    core_message_get_conversation_messages: { messages: [{ id: 5, text: '<b>Hello</b>' }] },
    core_message_send_instant_messages: [{ msgid: 9 }],
    message_popup_get_popup_notifications: () => ({ unreadcount: read ? 0 : 1, notifications: [{ id: 6, read, subject: 'New' }] }),
    core_message_mark_notification_read: () => { read = true; return { status: true }; },
    core_calendar_get_action_events_by_timesort: { events: [{ id: 2, name: 'Due', timesort: 123,
      action: { url: site + '/mod/assign/view.php?id=4&sesskey=secret' }, editurl: site + '/edit?sesskey=secret' }] },
    block_starredcourses_get_starred_courses: () => favourite ? [{ id: 12, fullname: 'Algorithms' }] : [],
    core_enrol_get_users_courses: [{ id: 12, fullname: 'Algorithms' }],
    core_course_set_favourite_courses: () => { favourite = true; return { warnings: [] }; },
  });
  assert.equal((await inbox(token)).conversations.length, 1);
  assert.equal((await conversation(token, 4)).messages[0].messageText, 'Hello');
  await assert.rejects(sendMessage(token, 8, 'Hello', async () => false), /Đã hủy/);
  assert.ok(!calls.some(call => call.method === 'core_message_send_instant_messages'));
  assert.equal((await sendMessage(token, 8, 'Hello', async () => true)).messageid, 9);
  assert.equal(calls.find(call => call.method === 'core_message_send_instant_messages')?.params.get('messages[0][touserid]'), '8');
  await markNotification(token, 6, async () => true);
  assert.equal(calls.find(call => call.method === 'core_message_mark_notification_read')?.params.get('notificationid'), '6');
  const todo = await todos(token);
  assert.equal(todo.events.length, 1);
  assert.ok(!JSON.stringify(todo).includes('secret'));
  assert.equal((await favouriteCourses(token)).courses.length, 0);
  assert.equal((await setFavouriteCourse(token, 12, true, async () => true)).state, 'favourite');
  assert.equal(calls.find(call => call.method === 'core_course_set_favourite_courses')?.params.get('courses[0][favourite]'), '1');
});

test('personal event uses timezone and iCal export writes a new file', async t => {
  const now = Math.floor(Date.now() / 1000);
  const calls = fixture(t, {
    core_calendar_create_calendar_events: { events: [{ id: 70 }] },
    core_webservice_get_site_info: { userid: 7 },
    core_enrol_get_users_courses: [],
    core_calendar_get_calendar_events: { events: [{ id: 2, name: 'Task', courseid: 0, timestart: now + 3600, timeduration: 600 }] },
  });
  await assert.rejects(createPersonalEvent(token, 'Task', '2026-11-01T09:00', 30, async () => true), /múi giờ/);
  assert.equal((await createPersonalEvent(token, 'Task', '2026-11-01T09:00+07:00', 30, async () => true)).id, 70);
  assert.equal(calls.find(call => call.method === 'core_calendar_create_calendar_events')?.params.get('events[0][timeduration]'), '1800');
  const directory = await mkdtemp(join(tmpdir(), 'course-ics-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'calendar.ics');
  assert.equal((await exportCalendar(token, path)).count, 1);
  assert.match(await readFile(path, 'utf8'), /BEGIN:VEVENT\r\n/);
  await assert.rejects(exportCalendar(token, path), /EEXIST/);
});
