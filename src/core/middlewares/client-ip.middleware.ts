import { Injectable, NestMiddleware } from "@nestjs/common";

import { NextFunction, Request, Response } from "express";
import { mw } from "request-ip";

@Injectable()
export class ClientIPMiddleware implements NestMiddleware {

  public use(req: Request, res: Response, next: NextFunction): void {
    const set = mw();
    set(req, res, next);
  }
}
