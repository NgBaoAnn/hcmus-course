import { createHash, timingSafeEqual } from 'node:crypto';

export const SITE = 'https://courses.fit.hcmus.edu.vn';

export interface SiteInfo {
  userid: number;
  fullname?: string;
  functions?: { name: string }[];
}

export interface PublicConfig {
  sitename?: string;
  enablewebservices: number;
  enablemobilewebservice: number;
  identityproviders?: { name: string; url: string }[];
}

export function decodeAppToken(href: string | null | undefined, passport: string): string {
  const match = /^(?:coursecli|moodlemobile):\/\/token=([A-Za-z0-9+/]+={0,2})$/.exec(href ?? '');
  const parts = match ? Buffer.from(match[1], 'base64').toString('utf8').split(':::') : [];
  const expected = createHash('md5').update(SITE + passport).digest('hex');
  if (![2, 3].includes(parts.length) || !/^[a-f0-9]{32}$/.test(parts[0]) ||
      !/^[a-f0-9]{32}$/.test(parts[1]) ||
      !timingSafeEqual(Buffer.from(parts[0]), Buffer.from(expected))) {
    throw new Error('Phản hồi đăng nhập không hợp lệ hoặc thuộc một lần đăng nhập khác.');
  }
  return parts[1];
}

async function requestJson(url: string, options: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new Error('Không kết nối được Moodle hoặc yêu cầu đã quá hạn.');
  }
  if (!response.ok) throw new Error(`Moodle trả HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error('Moodle không trả dữ liệu JSON hợp lệ.');
  }
}

export async function api<T = unknown>(token: string, method: string,
  params: Record<string, string | number | boolean> = {}): Promise<T> {
  const body = new URLSearchParams(Object.entries({ ...params, wstoken: token, wsfunction: method,
    moodlewsrestformat: 'json' }).map(([key, value]) => [key, String(value)]));
  const data = await requestJson(`${SITE}/webservice/rest/server.php`, { method: 'POST', body });
  const error = data as { exception?: string; errorcode?: string } | null;
  if (error?.exception || error?.errorcode) {
    const code = String(error.errorcode ?? 'unknown').replace(/[^a-z0-9_]/gi, '').slice(0, 80);
    throw new Error(`Moodle từ chối API: ${code}. Nếu token hết hạn, chạy lại auth login.`);
  }
  return data as T;
}

export async function publicConfig(): Promise<PublicConfig> {
  const args = [{ index: 0, methodname: 'tool_mobile_get_public_config', args: {} }];
  const query = new URLSearchParams({ info: args[0].methodname, args: JSON.stringify(args) });
  const result = (await requestJson(`${SITE}/lib/ajax/service-nologin.php?${query}`)) as
    { error: boolean; data?: PublicConfig }[];
  if (!result?.[0] || result[0].error || !result[0].data) {
    throw new Error('Không đọc được cấu hình công khai của Moodle.');
  }
  return result[0].data;
}
