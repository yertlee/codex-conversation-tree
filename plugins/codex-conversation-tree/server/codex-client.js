import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';

export class CodexClient extends EventEmitter {
  constructor(command = 'codex') {
    super();
    this.child = spawn(command, ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.pending = new Map();
    this.nextId = 1;
    createInterface({ input: this.child.stdout }).on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      this.handleMessage(message);
    });
    this.child.on('exit', code => {
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error(`Codex app-server exited (${code})`));
      }
      this.pending.clear();
      this.emit('exit', code);
    });
    this.child.stderr.on('data', chunk => process.stderr.write(chunk));
    this.ready = this.request('initialize', {
      clientInfo: { name: 'codex_conversation_tree', title: 'Codex Conversation Tree', version: '0.3.3' }
    }).then(() => this.send({ method: 'initialized', params: {} }));
  }

  handleMessage(message) {
    if (message.id !== undefined && ('result' in message || 'error' in message)) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      else entry.resolve(message.result);
    } else if (message.id !== undefined && message.method) {
      this.emit('serverRequest', message);
    } else if (message.method) {
      this.emit('notification', message);
    }
  }

  send(message) { this.child.stdin.write(JSON.stringify(message) + '\n'); }
  respond(id, result) { this.send({ id, result }); }
  respondError(id, code, message) { this.send({ id, error: { code, message } }); }

  request(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }

  async call(method, params = {}) { await this.ready; return this.request(method, params); }
  close() { this.child.kill(); }
}
