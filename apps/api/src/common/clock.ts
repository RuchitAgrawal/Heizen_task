import { Injectable } from '@nestjs/common';

/** Injected so tests (and the demo generator) can control "now". */
@Injectable()
export class Clock {
  private fixed: Date | null = null;
  now(): Date {
    return this.fixed ? new Date(this.fixed) : new Date();
  }
  set(date: Date | null) {
    this.fixed = date;
  }
}
