import { Injectable, NestMiddleware } from "@nestjs/common";

import { NextFunction, Request, Response } from "express";

import compression from "compression";

@Injectable()
export class CompressionMiddleware implements NestMiddleware {

  public use(req: Request, res: Response, next: NextFunction): void {
    const set = compression();
    set(req, res, next);
  }
}
