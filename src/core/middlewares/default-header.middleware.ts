import { Injectable, NestMiddleware } from "@nestjs/common";

import { NextFunction, Request, Response } from "express";

@Injectable()
export class DefaultHeaderMiddleware implements NestMiddleware {

  public use(req: Request, res: Response, next: NextFunction): void {
    res.set({
      "accept": "application/json",
      "content-type": "application/json"
    });
    next();
  }
}
