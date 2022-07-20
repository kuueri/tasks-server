import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { defer, exhaustMap, map, Observable, tap } from "rxjs";
import { InjectRedis } from "@liaoliaots/nestjs-redis";
import { randomBytes } from "crypto";
import { isEmpty } from "lodash";
import { hash } from "argon2";

import { UtilService } from "src/core/services/util.service";

import { SafeAny } from "src/core/types/empty";
import { Level } from "src/core/types/level";

import Redis from "ioredis";

@Injectable()
export class ProjectService {

  constructor(
    private readonly config: ConfigService,
    @InjectRedis()
    private readonly redis: Redis,
    private readonly util: UtilService
  ) { }

  public info(projectId: string): Observable<{ [f: string]: SafeAny }> {
    const BATCH = this.redis.pipeline();

    BATCH.select(0);
    BATCH.hgetall(projectId);

    return defer(() => BATCH.exec()).pipe(
      map(v => {
        if (v) {
          const R = this.util.toTypes(v[1][1]) as { [f: string]: SafeAny };
          if (!isEmpty(R)) {
            // @ts-ignore
            R.token = undefined;
            // @ts-ignore
            R.id = undefined;
            return R;
          }
          throw new NotFoundException();
        }
        throw new NotFoundException();
      })
    );
  }

  public register(project: { [f: string]: string }): Observable<{ [f: string]: string }> {
    const id = randomBytes(16).toString("hex").toUpperCase();
    const token = randomBytes(64).toString("base64url");
    const level = this.config.get("LEVEL") as Level;

    const BATCH = this.redis.pipeline();

    BATCH.select(0);
    BATCH.sadd("MEMBERS:ID", id);
    BATCH.sadd("MEMBERS:EMAIL", project.email);

    return defer(() => hash(token)).pipe(
      tap({
        next: hashToken => {
          BATCH.hset(id, {
            taskInQueueLimit: this.config.get("SERVICE.QUEUE.LIMIT"),
            taskInQueue: 0,
            createdAt: Date.now(),
            email: project.email,
            token: hashToken,
            as: level === "PRODUCTION"
              ? "GUEST"
              : "DEV",
            id
          });
        }
      }),
      exhaustMap(() => defer(() => BATCH.exec()).pipe(
        map(() => ({ id, token }))
      ))
    );
  }
}
