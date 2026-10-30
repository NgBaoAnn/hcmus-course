import { open, rm } from 'node:fs/promises';
import { api, SITE, type SiteInfo } from './moodle.js';
import { downloadMoodleFiles } from './assignments.js';
import { calendar, forumView, notifications, progress } from './campus.js';
import { confirm, render, requireId } from './terminal.js';
import { listCourses, viewCourse, type MoodleWarning } from './student.js';

type Check = (message: string) => Promise<boolean>;
const verifiedUser = async (token: string) => requireId(String((await api<SiteInfo>(token, 'core_webservice_get_site_info')).userid), 'User ID');
const approved = async (message: string, check: Check = confirm) => { if (!await check(message)) throw new Error('Đã hủy; chưa gửi thay đổi lên Moodle.'); };
const text = (value: string | undefined, label: string) => {
  if (!value?.trim() || value.length > 100_000) throw new Error(`${label} phải có nội dung và không vượt 100000 ký tự.`);
  return value.trim();
};
const previewText = (value: string, check?: Check) => check ? value : value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = (value: string) => `<p>${value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>')}</p>`;

export async function materials(token: string, courseId: number | string) {
  const course = await viewCourse(token, courseId);
  const items = course.sections.flatMap(section => section.modules.filter(module =>
    ['resource', 'folder', 'url', 'page', 'book', 'imscp'].includes(module.modname) || (module.contents?.length ?? 0) > 0)
    .map(module => ({ id: module.id, name: module.name, type: module.modname, section: section.name,
      descriptionText: module.descriptionText, webUrl: module.url ?? course.webUrl,
      files: (module.contents ?? []).filter(file => file.fileurl && /^https:\/\/courses\.fit\.hcmus\.edu\.vn\/(webservice\/)?pluginfile\.php\//.test(file.fileurl)).map(file => {
        const url = new URL(file.fileurl!);
        for (const key of url.searchParams.keys()) if (/token|sesskey|secret|key/i.test(key)) url.searchParams.delete(key);
        return { filename: file.filename, fileurl: url.href, filesize: file.filesize };
      }) })));
  return { courseid: course.courseid, materials: items, warnings: course.warnings };
}

export async function downloadMaterial(token: string, courseId: number | string, moduleId: number | string, directory = process.cwd()) {
  const id = requireId(String(moduleId), 'Module ID');
  const list = await materials(token, courseId);
  const item = list.materials.find(module => module.id === id);
  if (!item) throw new Error('Không tìm thấy tài liệu trong môn học.');
  if (!item.files.length) throw new Error('Tài liệu này không có file tải qua API; mở URL trên Moodle.');
  return { downloaded: await downloadMoodleFiles(token, item.files, directory), warnings: list.warnings };
}

export async function markCompletion(token: string, courseId: number | string, moduleId: number | string, done: boolean, check?: Check) {
  const id = requireId(String(moduleId), 'Module ID');
  const before = await progress(token, courseId);
  const activity = before.activities.find(item => item.cmid === id);
  if (!activity || activity.tracking !== 1 || activity.isautomatic === true) throw new Error('Hoạt động không có chế độ tự đánh dấu hoàn thành.');
  await approved(`${done ? 'Đánh dấu hoàn thành' : 'Bỏ dấu hoàn thành'}: ${activity.name}?`, check);
  await api(token, 'core_completion_update_activity_completion_status_manually', { cmid: id, completed: done });
  const after = await progress(token, courseId);
  const current = after.activities.find(item => item.cmid === id);
  if (!current || (current.state > 0) !== done) throw new Error('Moodle chưa xác nhận trạng thái mới; kiểm tra lại trên website.');
  return { state: done ? 'completed' : 'incomplete', activity: current, warnings: after.warnings };
}

export async function forumWrite(token: string, action: 'create' | 'reply' | 'subscribe' | 'favourite', idValue: number | string,
  options: { subject?: string; body?: string; enabled?: boolean; check?: Check } = {}) {
  const id = requireId(String(idValue), action === 'reply' ? 'Post ID' : action === 'create' ? 'Forum ID' : 'Discussion ID');
  if (action === 'create' || action === 'reply') {
    const subject = text(options.subject, 'Tiêu đề');
    const body = text(options.body, 'Nội dung');
    if (action === 'create') {
      const access = await api<{ status: boolean }>(token, 'mod_forum_can_add_discussion', { forumid: id });
      if (!access.status) throw new Error('Bạn không có quyền tạo chủ đề trong diễn đàn này.');
    }
    await approved(`${action === 'create' ? 'Tạo chủ đề trong forum' : 'Trả lời bài viết'} #${id}: ${previewText(subject, options.check)}?\nNội dung:\n${previewText(body, options.check)}`, options.check);
    const result = await api<{ discussionid?: number; postid?: number; post?: { discussionid?: number }; warnings?: MoodleWarning[] }>(token,
      action === 'create' ? 'mod_forum_add_discussion' : 'mod_forum_add_discussion_post',
      action === 'create' ? { forumid: id, subject, message: html(body) } : { postid: id, subject, message: html(body), messageformat: 1 });
    const created = action === 'create' ? result.discussionid : result.postid;
    if (!created) throw new Error('Moodle chưa xác nhận bài viết mới; kiểm tra diễn đàn trước khi thử lại.');
    const discussionid = action === 'create' ? created : result.post?.discussionid;
    return { state: 'created', id: created, webUrl: discussionid ? `${SITE}/mod/forum/discuss.php?d=${discussionid}${action === 'reply' ? `#p${created}` : ''}` : `${SITE}/mod/forum/`,
      warnings: result.warnings ?? [] };
  }
  const enabled = options.enabled === true;
  const forumid = action === 'subscribe' ? (await forumView(token, id)).forumid : undefined;
  await approved(`${enabled ? 'Bật' : 'Tắt'} ${action === 'subscribe' ? 'theo dõi' : 'yêu thích'} chủ đề #${id}?`, options.check);
  const result = await api<{ subscribed?: boolean; favourited?: boolean; warnings?: MoodleWarning[] }>(token,
    action === 'subscribe' ? 'mod_forum_set_subscription_state' : 'mod_forum_toggle_favourite_state',
    action === 'subscribe' ? { forumid: requireId(String(forumid), 'Forum ID'), discussionid: id, targetstate: enabled } : { discussionid: id, targetstate: enabled });
  const observed = action === 'subscribe' ? result.subscribed : result.favourited;
  if (observed !== enabled) throw new Error('Moodle chưa xác nhận thay đổi trạng thái chủ đề; kiểm tra lại trên website.');
  return { state: enabled ? 'enabled' : 'disabled', discussionid: id, warnings: result.warnings ?? [] };
}

interface Conversation { id: number; name?: string; type?: number; unreadcount?: number; members?: { id: number; fullname: string }[] }
interface Message { id: number; text?: string; timecreated?: number; useridfrom?: number; useridto?: number }
export async function inbox(token: string, limit = 20) {
  const count = requireId(String(limit), 'Giới hạn');
  if (count > 100) throw new Error('Giới hạn tối đa là 100.');
  const userid = await verifiedUser(token);
  const result = await api<{ conversations: Conversation[] }>(token, 'core_message_get_conversations', { userid, limitfrom: 0, limitnum: count });
  if (!Array.isArray(result.conversations)) throw new Error('Hộp tin nhắn trả về không hợp lệ.');
  return { conversations: result.conversations, warnings: [] as MoodleWarning[] };
}
export async function conversation(token: string, idValue: number | string, limit = 30) {
  const id = requireId(String(idValue), 'Conversation ID');
  const count = requireId(String(limit), 'Giới hạn');
  if (count > 100) throw new Error('Giới hạn tối đa là 100.');
  const userid = await verifiedUser(token);
  const result = await api<{ messages: Message[] }>(token, 'core_message_get_conversation_messages',
    { currentuserid: userid, convid: id, limitfrom: 0, limitnum: count, newest: true });
  if (!Array.isArray(result.messages)) throw new Error('Tin nhắn trả về không hợp lệ.');
  return { conversationid: id, messages: result.messages.map(message => ({ ...message, messageText: render(message.text) })), warnings: [] as MoodleWarning[] };
}
export async function sendMessage(token: string, userId: number | string, body: string, check?: Check) {
  const id = requireId(String(userId), 'User ID');
  const message = text(body, 'Tin nhắn');
  if (id === await verifiedUser(token)) throw new Error('Không gửi tin nhắn cho chính mình.');
  await approved(`Gửi tin nhắn cho Moodle User ID #${id}?\nNội dung:\n${previewText(message, check)}`, check);
  const result = await api<{ msgid: number; errormessage?: string }[]>(token, 'core_message_send_instant_messages',
    { 'messages[0][touserid]': id, 'messages[0][text]': message, 'messages[0][textformat]': 0 });
  if (!Array.isArray(result) || result[0]?.msgid <= 0) throw new Error(`Moodle chưa xác nhận gửi tin nhắn: ${render(result?.[0]?.errormessage) || 'không rõ lý do'}`);
  return { state: 'sent', messageid: result[0].msgid, warnings: [] as MoodleWarning[] };
}

export async function markNotification(token: string, idValue: number | string, check?: Check) {
  const id = requireId(String(idValue), 'Notification ID');
  const before = await notifications(token, 100);
  const item = before.notifications.find(notification => notification.id === id);
  if (!item) throw new Error('Không tìm thấy thông báo trong 100 thông báo mới nhất.');
  if (item.read) return { state: 'read', notificationid: id, warnings: [] as MoodleWarning[] };
  await approved(`Đánh dấu đã đọc thông báo #${id}: ${item.subject ?? 'Thông báo'}?`, check);
  await api(token, 'core_message_mark_notification_read', { notificationid: id, timeread: Math.floor(Date.now() / 1000) });
  const after = await notifications(token, 100);
  if (!after.notifications.find(notification => notification.id === id)?.read) throw new Error('Moodle chưa xác nhận đã đọc; kiểm tra lại trước khi thử lại.');
  return { state: 'read', notificationid: id, warnings: [] as MoodleWarning[] };
}

interface ActionEvent { id: number; name: string; timesort: number; course?: { id: number; fullname?: string }; url?: string; action?: { name?: string; url?: string } }
export async function todos(token: string, days = 30) {
  const window = requireId(String(days), 'Số ngày');
  if (window > 365) throw new Error('Số ngày tối đa là 365.');
  const now = Math.floor(Date.now() / 1000);
  const result = await api<{ events: ActionEvent[] }>(token, 'core_calendar_get_action_events_by_timesort',
    { timesortfrom: now, timesortto: now + window * 86400, limitnum: 50 });
  if (!Array.isArray(result.events)) throw new Error('Danh sách cần làm trả về không hợp lệ.');
  return { days: window, events: result.events.map(event => {
    const value = event.action?.url || event.url;
    const url = value && URL.canParse(value, SITE) ? new URL(value, SITE) : null;
    if (url) for (const key of url.searchParams.keys()) if (/token|sesskey|secret|key/i.test(key)) url.searchParams.delete(key);
    return { id: event.id, name: event.name, timesort: event.timesort,
      course: event.course ? { id: event.course.id, fullname: event.course.fullname } : null,
      webUrl: url?.origin === SITE && !url.username && !url.password ? url.href : `${SITE}/calendar/view.php` };
  }),
    truncated: result.events.length === 50, warnings: [] as MoodleWarning[] };
}
export async function favouriteCourses(token: string) {
  const result = await api<{ id: number; fullname: string }[]>(token, 'block_starredcourses_get_starred_courses');
  if (!Array.isArray(result)) throw new Error('Danh sách môn yêu thích trả về không hợp lệ.');
  return { courses: result.map(course => ({ ...course, webUrl: `${SITE}/course/view.php?id=${course.id}` })), warnings: [] as MoodleWarning[] };
}
export async function setFavouriteCourse(token: string, courseId: number | string, enabled: boolean, check?: Check) {
  const id = requireId(String(courseId), 'Course ID');
  const courses = await listCourses(token);
  const course = courses.courses.find(item => item.id === id);
  if (!course) throw new Error('Môn học không nằm trong danh sách đã ghi danh.');
  await approved(`${enabled ? 'Yêu thích' : 'Bỏ yêu thích'} môn ${course.fullname}?`, check);
  await api(token, 'core_course_set_favourite_courses', { 'courses[0][id]': id, 'courses[0][favourite]': enabled });
  const after = await favouriteCourses(token);
  if (after.courses.some(item => item.id === id) !== enabled) throw new Error('Moodle chưa xác nhận thay đổi yêu thích; kiểm tra lại.');
  return { state: enabled ? 'favourite' : 'normal', courseid: id, warnings: [] as MoodleWarning[] };
}

export async function createPersonalEvent(token: string, nameValue: string, startValue: string, minutesValue: number | string, check?: Check) {
  const name = text(nameValue, 'Tên sự kiện');
  const start = Date.parse(startValue);
  const minutes = requireId(String(minutesValue), 'Số phút');
  if (!Number.isFinite(start) || minutes > 1440) throw new Error('Thời gian phải là ISO 8601 có múi giờ và thời lượng tối đa 1440 phút.');
  if (!/[zZ]|[+-]\d\d:\d\d$/.test(startValue)) throw new Error('Thời gian phải có múi giờ, ví dụ 2026-11-01T09:00+07:00.');
  const timestart = Math.floor(start / 1000);
  await approved(`Tạo sự kiện cá nhân ${name} lúc ${startValue}, dài ${minutes} phút?`, check);
  const result = await api<{ events: { id: number }[]; warnings?: MoodleWarning[] }>(token, 'core_calendar_create_calendar_events',
    { 'events[0][name]': name, 'events[0][eventtype]': 'user', 'events[0][timestart]': timestart,
      'events[0][timeduration]': minutes * 60 });
  const id = result.events?.[0]?.id;
  if (!id) throw new Error('Moodle chưa xác nhận tạo sự kiện; kiểm tra lịch trước khi thử lại.');
  return { state: 'created', id, webUrl: `${SITE}/calendar/view.php?view=day&time=${timestart}`, warnings: result.warnings ?? [] };
}

export async function exportCalendar(token: string, path: string, days = 365) {
  if (!path.endsWith('.ics')) throw new Error('File xuất phải có đuôi .ics.');
  const result = await calendar(token, undefined, days);
  const escape = (value: string) => render(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const stamp = (seconds: number) => new Date(seconds * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Course CLI//Moodle Calendar//VI'];
  for (const event of result.events) lines.push('BEGIN:VEVENT', `UID:moodle-${event.id}@courses.fit.hcmus.edu.vn`,
    `DTSTAMP:${stamp(Math.floor(Date.now() / 1000))}`, `DTSTART:${stamp(event.timestart)}`,
    `DTEND:${stamp(event.timestart + (event.timeduration ?? 0))}`, `SUMMARY:${escape(event.name)}`,
    `DESCRIPTION:${escape(event.descriptionText)}`, `URL:${event.webUrl}`, 'END:VEVENT');
  lines.push('END:VCALENDAR', '');
  const handle = await open(path, 'wx', 0o600);
  let complete = false;
  try { await handle.writeFile(lines.join('\r\n')); complete = true; }
  finally { await handle.close(); if (!complete) await rm(path, { force: true }); }
  return { path, count: result.events.length, days: result.days, warnings: result.warnings };
}
