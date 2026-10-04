import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

@Injectable()
export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  assertAllowed(key: string, now = Date.now()) {
    if (this.failures.size >= 10_000) {
      for (const [candidate, attempt] of this.failures) if (attempt.resetAt <= now) this.failures.delete(candidate);
      if (this.failures.size >= 10_000) this.failures.delete(this.failures.keys().next().value!);
    }
    const attempt = this.failures.get(key);
    if (!attempt || attempt.resetAt <= now) {
      if (attempt) this.failures.delete(key);
      return;
    }
    if (attempt.count >= MAX_FAILURES) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'LOGIN_THROTTLED', 'Too many sign-in attempts. Try again later.');
    }
  }

  failed(key: string, now = Date.now()) {
    const attempt = this.failures.get(key);
    this.failures.set(key, !attempt || attempt.resetAt <= now ? { count: 1, resetAt: now + WINDOW_MS } : { ...attempt, count: attempt.count + 1 });
  }

  succeeded(key: string) {
    this.failures.delete(key);
  }
}
