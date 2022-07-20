import { Injectable, NestMiddleware } from "@nestjs/common";

import { NextFunction, Request, Response } from "express";

@Injectable()
export class AppHeaderMiddleware implements NestMiddleware {

  public use(req: Request, res: Response, next: NextFunction): void {
    res.set({
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "x-robots-tag": "noindex, nofollow",
      "x-xss-protection": "0"
    });
    next();
  }
}
