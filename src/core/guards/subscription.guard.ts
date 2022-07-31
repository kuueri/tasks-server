import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

import { defer, exhaustMap, map, Observable, take } from "rxjs";
import { isEmpty, toSafeInteger, toString, trim } from "lodash";
import { InjectRedis } from "@liaoliaots/nestjs-redis";
import { Request } from "express";
import { verify } from "argon2";

import Redis from "ioredis";

@Injectable()
export class SubscriptionGuard implements CanActivate {

  constructor(
    @InjectRedis()
    private readonly redis: Redis
  ) { }

  public canActivate(context: ExecutionContext): Observable<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = toString(req.headers["authorization"]).split(" ")[1];
    const projectId = toString(req.headers["x-kuueri-tasks-project"]);

    if (isEmpty(trim(token)) || isEmpty(trim(projectId))) {
      throw new UnauthorizedException();
    }

    const BATCH = this.redis.pipeline();

    BATCH.select(0);
    BATCH.hget(projectId, "id");
    BATCH.hget(projectId, "token");
    BATCH.sismember("MEMBERS:ID", projectId);

    return defer(() => BATCH.exec()).pipe(
      map(v => {
        if (v) {
          const id = v[1][1] as string;
          const token = v[2][1] as string;
          const isMember = !!toSafeInteger(v[3][1]);
          if (isMember && id && id === projectId) {
            return token;
          }
          throw new UnauthorizedException();
        }
        throw new UnauthorizedException();
      }),
      exhaustMap(hashToken => defer(() => verify(hashToken, token)).pipe(
        map(verify => {
          if (verify) {
            return true;
          }
          throw new UnauthorizedException();
        })
      )),
      take(1)
    );
  }
}
