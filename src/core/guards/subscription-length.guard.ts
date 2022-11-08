import { CanActivate, ExecutionContext, Injectable, PayloadTooLargeException, UnauthorizedException } from "@nestjs/common";

import { isEmpty, toSafeInteger, toString, trim } from "lodash";
import { defer, map, Observable, take } from "rxjs";
import { InjectRedis } from "@liaoliaots/nestjs-redis";
import { Request } from "express";

import Redis from "ioredis";

@Injectable()
export class SubscriptionLengthGuard implements CanActivate {

  constructor(
    @InjectRedis()
    private readonly redis: Redis
  ) { }

  public canActivate(context: ExecutionContext): Observable<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const projectId = toString(req.headers["x-kuueri-tasks-project"]);

    if (isEmpty(trim(projectId))) {
      throw new UnauthorizedException();
    }

    const BATCH = this.redis.pipeline();

    BATCH.select(0);
    BATCH.hget(projectId, "taskInQueue");
    BATCH.hget(projectId, "taskInQueueLimit");

    return defer(() => BATCH.exec()).pipe(
      map(v => {
        if (v) {
          const queuesLength = Math.abs(toSafeInteger(v[1][1]));
          const limit = toSafeInteger(v[2][1]);
          if (queuesLength < limit) {
            return true;
          }
          throw new PayloadTooLargeException();
        }
        throw new UnauthorizedException();
      }),
      take(1)
    );
  }
}
