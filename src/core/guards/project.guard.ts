import { BadRequestException, CanActivate, ConflictException, ExecutionContext, Injectable, InternalServerErrorException } from "@nestjs/common";

import { isEmpty, toSafeInteger, toString, trim } from "lodash";
import { defer, map, Observable } from "rxjs";
import { InjectRedis } from "@liaoliaots/nestjs-redis";
import { Request } from "express";

import Redis from "ioredis";

@Injectable()
export class ProjectGuard implements CanActivate {

  constructor(
    @InjectRedis()
    private readonly redis: Redis
  ) { }

  canActivate(context: ExecutionContext): Observable<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const email = toString(req.body?.email);

    if (isEmpty(trim(email))) {
      throw new BadRequestException();
    }

    const BATCH = this.redis.pipeline();

    BATCH.select(0);
    BATCH.sismember("MEMBERS:EMAIL", email);

    return defer(() => BATCH.exec()).pipe(
      map(v => {
        if (v) {
          const isMember = !!toSafeInteger(v[1][1]);
          if (isMember) {
            throw new ConflictException();
          }
          return true;
        }
        throw new InternalServerErrorException();
      })
    );
  }
}
