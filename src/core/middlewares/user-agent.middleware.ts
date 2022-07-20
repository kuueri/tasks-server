import { Injectable, NestMiddleware } from "@nestjs/common";

import { NextFunction, Request, Response } from "express";
import { express } from "express-useragent";

@Injectable()
export class UserAgentMiddleware implements NestMiddleware {

  public use(req: Request, res: Response, next: NextFunction): void {
    const set = express();
    set(req, res, next);
  }
}
