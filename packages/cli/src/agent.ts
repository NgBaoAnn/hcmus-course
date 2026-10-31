import { createInterface } from 'node:readline/promises';

interface AgentIO {
  interactive?: boolean;
  readInput?: () => Promise<string>;
  write?: (line: string) => void;
}

async function readLineFromStdin(): Promise<string> {
  const io = createInterface({ input: process.stdin });
  try {
    const iterator = io[Symbol.asyncIterator]();
    const next = await iterator.next();
    if (next.done) throw new Error('stdin kết thúc trước khi xác nhận.');
    return next.value;
  } finally {
    io.close();
  }
}

export class AgentSession {
  private readonly readInput: () => Promise<string>;
  private readonly write: (line: string) => void;
  private declined = false;

  constructor(readonly operation: string, io: AgentIO = {}) {
    if (io.interactive === false) throw new Error('Chế độ agent cần terminal tương tác để xác nhận thao tác ghi.');
    this.readInput = io.readInput ?? readLineFromStdin;
    this.write = io.write ?? (line => { process.stdout.write(`${line}\n`); });
  }

  emit(event: string, data: Record<string, unknown> = {}): void {
    this.write(JSON.stringify({ schema: 1, event, operation: this.operation, ...data }));
  }

  async confirm(preview: string, stage = 'confirm'): Promise<boolean> {
    this.emit('preview', { stage, preview });
    this.emit('confirmation_required', { stage, accept: 'yes' });
    try {
      const accepted = (await this.readInput()).trim().toLowerCase() === 'yes';
      this.declined = !accepted;
      return accepted;
    } catch { this.declined = true; return false; }
  }

  async ask(prompt: string, options?: { secret?: boolean }): Promise<string> {
    if (options?.secret) throw new Error('Quiz có mật khẩu: hãy làm trên website để nhập mật khẩu riêng tư.');
    this.emit('input_required', { prompt });
    return this.readInput();
  }

  result(result: unknown): void { this.emit('result', { result }); }

  error(error: unknown): void {
    const code = this.declined ? 'cancelled' : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'error';
    this.emit('error', { code, message: error instanceof Error ? error.message : 'Lỗi không xác định.' });
  }
}
