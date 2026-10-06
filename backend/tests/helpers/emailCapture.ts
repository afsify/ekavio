import type { ActionEmail, EmailService } from '../../src/services/emailService.js';
// Explicitly injected in disposable tests; never an environment transport.
export class EmailCapture implements EmailService {
  public enabled = true;
  public publicUrl = 'http://127.0.0.1:4175';
  public messages: ActionEmail[] = [];
  public fail = false;
  public async send(message: ActionEmail): Promise<void> {
    if (this.fail) throw new Error('Test adapter unavailable');
    this.messages.push(message);
  }
  public token(purpose: ActionEmail['purpose']): string {
    const message = this.messages.findLast((value) => value.purpose === purpose);
    if (!message) throw new Error('No captured action email');
    return new URLSearchParams(new URL(message.url).hash.slice(1)).get('token')!;
  }
}
