import { Injectable, Logger } from '@nestjs/common';

/**
 * Email is out of scope. Where the business would send one, we log it instead,
 * so the moment and the recipient are visible in the API logs.
 */
@Injectable()
export class Notifier {
  private readonly log = new Logger('Email');

  send(to: string, subject: string) {
    this.log.log(`would email ${to}: ${subject}`);
  }
}
