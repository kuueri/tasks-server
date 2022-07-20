import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

import { Request } from "express";

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {

  protected getTracker(req: Request): string {
    if (req?.clientIp) {
      return req.clientIp;
    }
    if (req.ips?.length) {
      return req.ips[0];
    }
    return req.ip;
  }
}
