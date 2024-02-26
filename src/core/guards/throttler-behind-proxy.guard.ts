import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

import { Request } from "express";

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {

  protected async getTracker(req: Request) {
    if (req?.clientIp) {
      return req.clientIp;
    }
    if (req.ips?.length) {
      return req.ips[0];
    }
    return req.ip!;
  }
}
