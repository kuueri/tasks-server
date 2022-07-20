import { Injectable, NestMiddleware } from "@nestjs/common";

import { NextFunction, Request, Response } from "express";

import nocache from "nocache";

@Injectable()
export class NoCacheMiddleware implements NestMiddleware {

  public use(req: Request, res: Response, next: NextFunction): void {
    const set = nocache();
    set(req, res, next);
  }
}
