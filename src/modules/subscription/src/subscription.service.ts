import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";

import { defer, exhaustMap, identity, map, Observable, repeat, retry, switchMap, tap, timer } from "rxjs";
import { defaults, isEmpty, toSafeInteger, toString, zipObject } from "lodash";
import { addMilliseconds, differenceInMilliseconds, isFuture } from "date-fns";
import { createWriteStream } from "fs";
import { randomBytes } from "crypto";
import { InjectRedis } from "@liaoliaots/nestjs-redis";

import { UtilService } from "src/core/services/util.service";
import { AESService } from "src/core/services/aes.service";

import { StackQueued, Queued, Dequeue, RecordQueue, RecordQueueConf, RegisterOption, StateQueue } from "src/core/types/queue";
import { TasksConfig, TasksReq, TasksTimeline } from "src/core/types/tasks";
import { Done, SafeAny } from "src/core/types/empty";
import { Level } from "src/core/types/level";

import Redis from "ioredis";

@Injectable()
export class SubscriptionService implements OnApplicationBootstrap {

  private stackQueued: Array<StackQueued> = [];
  private isInitialize = false;

  private readonly logger = new Logger();
  private readonly level = this.config.get("LEVEL") as Level;

  private readonly DEFAULT_TASKS_CONFIG: Readonly<TasksConfig> = {
    executionAt: 0,
    executionDelay: 1,
    retry: 0,
    retryAt: 0,
    retryInterval: 1000,
    retryExponential: true,
    repeat: 0,
    repeatAt: 0,
    repeatInterval: 1000,
    repeatExponential: true,
    timeout: 300000
  };
  /**
   * Set a timeout in seconds on key
   * After the timeout has expired, the key will automatically be deleted
  */
  private readonly DEFAULT_EXPIRATION = this.config.get("DATABASE.REDIS.EXPIRATION_KEY") as number;

  constructor(
    private readonly config: ConfigService,
    @InjectRedis()
    private readonly redis: Redis,
    private readonly http: HttpService,
    private readonly util: UtilService,
    private readonly aes: AESService
  ) { }

  /**
   * @event
   * @private
  */
  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.trackChanges();
      await this.resubscribe();
      this.isInitialize = true;
    } catch (e) {
      this.logger.error(e);
      this.isInitialize = true;
    }
  }

  public subscribe(tasks: TasksReq, projectId: string): Observable<Queued> {
    if (tasks.httpRequest?.data && tasks.httpRequest.method === "DELETE") {
      tasks.httpRequest.data = undefined;
    }
    // Assigns own and inherited enumerable string keyed properties of source objects to the destination object for all destination properties that resolve to undefined
    tasks.config = defaults(tasks.config, this.DEFAULT_TASKS_CONFIG);
    // Assign new value if `executionTime` is exists
    if (tasks.config.executionAt) {
      tasks.config.executionDelay = 1;
    }
    if (tasks.config.repeatAt) {
      tasks.config.repeat = 1;
    }
    if (tasks.config.retryAt) {
      tasks.config.retry = 1;
    }
    // Register a subscription
    const queued = this.register(tasks, { pId: projectId });
    const recordQueued: RecordQueue = {
      ...queued,
      metadata: this.aes.encrypt(JSON.stringify(tasks))
    };
    const recordConfQueued: RecordQueueConf = {
      executionAt: tasks.config.executionAt,
      executionDelay: tasks.config.executionDelay,
      estimateEndAt: 0,
      estimateExecAt: queued.estimateExecAt,
      retryCount: 0,
      retryLimit: tasks.config.retry,
      finalizeRetry: 0,
      estimateNextRetryAt: 0,
      isRetryTerminated: false,
      repeatCount: 0,
      repeatLimit: tasks.config.repeat,
      finalizeRepeat: 0,
      isRepeatTerminated: false,
      estimateNextRepeatAt: 0
    };

    const BATCH = this.redis.pipeline();

    BATCH.select(0);
    BATCH.hincrby(projectId, "taskInQueue", 1);
    BATCH.select(1);
    BATCH.hset(this.DB_1(queued.id, projectId), recordQueued);
    BATCH.select(2);
    BATCH.hset(this.DB_2(queued.id, projectId), recordConfQueued);
    BATCH.select(3);
    BATCH.rpush(this.DB_3(queued.id, projectId), JSON.stringify({
      label: "Subscribe",
      description: "Register task resource",
      createdAt: Date.now()
    }));

    const copy = queued;
    // @ts-ignore
    copy.pId = undefined;

    return defer(() => BATCH.exec()).pipe(
      map(() => copy),
      tap({
        next: () => this.logTimes(tasks, queued)
      })
    );
  }

  public unsubscribe(queuedId: string, projectId: string): Observable<Dequeue> {
    const today = Date.now();
    const BATCH_1 = this.redis.pipeline();

    BATCH_1.select(1);
    BATCH_1.hget(this.DB_1(queuedId, projectId), "state");

    return defer(() => BATCH_1.exec()).pipe(
      map(v => {
        if (v) {
          const state = v[1][1] as StateQueue;
          if (state === "RUNNING") {
            return state;
          }
          throw new BadRequestException();
        }
        throw new BadRequestException();
      }),
      exhaustMap(() => {
        const BATCH_2 = this.redis.pipeline();

        BATCH_2.select(0);
        BATCH_2.hincrby(projectId, "taskInQueue", -1);

        BATCH_2.select(1);
        BATCH_2.hset(this.DB_1(queuedId, projectId), {
          estimateExecAt: 0,
          estimateEndAt: today,
          currentlyRepeat: false,
          currentlyRetry: false,
          state: "CANCELED"
        });
        BATCH_2.expire(this.DB_1(queuedId, projectId), this.DEFAULT_EXPIRATION);
        BATCH_2.select(2);
        BATCH_2.hset(this.DB_2(queuedId, projectId), {
          estimateNextRepeatAt: 0,
          estimateNextRetryAt: 0,
          estimateExecAt: 0,
          estimateEndAt: today
        });
        BATCH_2.expire(this.DB_2(queuedId, projectId), this.DEFAULT_EXPIRATION);
        BATCH_2.select(3);
        BATCH_2.rpush(this.DB_3(queuedId, projectId), JSON.stringify({
          label: "Unsubscribe",
          description: "Task resource disposed",
          createdAt: today
        }));
        BATCH_2.expire(this.DB_3(queuedId, projectId), this.DEFAULT_EXPIRATION);

        return defer(() => BATCH_2.exec()).pipe(
          map(() => ({ response: "UNSUBSCRIBED" } as Dequeue))
        );
      })
    );
  }

  public purge(queuedId: string, projectId: string): Observable<{ [f: string]: string }> {
    const BATCH_1 = this.redis.pipeline();

    BATCH_1.select(1);
    BATCH_1.hget(this.DB_1(queuedId, projectId), "state");

    return defer(() => BATCH_1.exec()).pipe(
      map(v => {
        if (v) {
          const r = v[1][1] as StateQueue;
          if (r !== "RUNNING") {
            return r;
          }
          throw new BadRequestException();
        }
        throw new BadRequestException();
      }),
      exhaustMap(state => {
        const BATCH_2 = this.redis.pipeline();

        BATCH_2.select(1);
        BATCH_2.del(this.DB_1(queuedId, projectId));
        BATCH_2.select(2);
        BATCH_2.del(this.DB_2(queuedId, projectId));
        BATCH_2.select(3);
        BATCH_2.del(this.DB_3(queuedId, projectId));

        return defer(() => BATCH_2.exec()).pipe(
          map(v => {
            if (v) {
              const r1 = toSafeInteger(v[1][1]);
              const r2 = toSafeInteger(v[3][1]);
              const r3 = toSafeInteger(v[5][1]);
              if (r1 && r2 && r3) {
                return { response: "EMPTY" };
              }
              throw new BadRequestException();
            }
            throw new BadRequestException();
          }),
          tap({
            next: () => {
              if (state === "PAUSED") {
                const BATCH_3 = this.redis.pipeline();

                BATCH_3.select(0);
                BATCH_3.hincrby(projectId, "taskInQueue", -1);

                BATCH_3.exec();
              }
            }
          })
        );
      })
    );
  }

  public pause(queuedId: string, projectId: string): Observable<{ [f: string]: string }> {
    const today = Date.now();
    const BATCH_1 = this.redis.pipeline();

    BATCH_1.select(1);
    BATCH_1.hget(this.DB_1(queuedId, projectId), "state");

    return defer(() => BATCH_1.exec()).pipe(
      map(v => {
        if (v) {
          const state = v[1][1] as StateQueue;
          if (state === "RUNNING") {
            return state;
          }
          throw new BadRequestException();
        }
        throw new BadRequestException();
      }),
      exhaustMap(() => {
        const BATCH_2 = this.redis.pipeline();

        BATCH_2.select(1);
        BATCH_2.hset(this.DB_1(queuedId, projectId), {
          estimateExecAt: 0,
          state: "PAUSED"
        });
        BATCH_2.select(2);
        BATCH_2.hset(this.DB_2(queuedId, projectId), {
          estimateNextRepeatAt: 0,
          estimateNextRetryAt: 0,
          estimateEndAt: today
        });
        BATCH_2.select(3);
        BATCH_2.rpush(this.DB_3(queuedId, projectId), JSON.stringify({
          label: "Pause",
          description: "Stop dispatch task resource",
          createdAt: today
        }));

        return defer(() => BATCH_2.exec()).pipe(
          map(() => ({ response: "PAUSED" }))
        );
      })
    );
  }

  public resume(queuedId: string, projectId: string): Observable<Queued> {
    const BATCH_1 = this.redis.pipeline();

    BATCH_1.select(1);
    BATCH_1.hgetall(this.DB_1(queuedId, projectId));
    BATCH_1.select(2);
    BATCH_1.hgetall(this.DB_2(queuedId, projectId));

    return defer(() => BATCH_1.exec()).pipe(
      map(v => {
        if (v) {
          const recordQueue = this.util.toTypes<RecordQueue>(v![1][1] as RecordQueue);
          const recordQueueConf = this.util.toTypes<RecordQueueConf>(v![3][1] as RecordQueueConf);
          if (!isEmpty(recordQueue) && recordQueue.state === "PAUSED" && !isEmpty(recordQueueConf)) {
            return { recordQueue, recordQueueConf };
          }
          throw new BadRequestException();
        }
        throw new BadRequestException();
      }),
      exhaustMap(({ recordQueue, recordQueueConf }) => {
        const metadata = JSON.parse(this.aes.decrypt(recordQueue.metadata)) as TasksReq;
        const tasks: TasksReq = {
          httpRequest: { ...metadata.httpRequest },
          config: { ...metadata.config }
        };

        if (recordQueue.currentlyRepeat) {
          tasks.httpRequest.headers = {
            ...tasks.httpRequest.headers,
            "X-Kuueri-Tasks-Queue": queuedId,
            "X-Kuueri-Tasks-Repeat-Count": recordQueueConf.repeatCount.toString(),
            "X-Kuueri-Tasks-Currently-Repeat": recordQueueConf.repeatCount === recordQueueConf.repeatLimit
              ? "false"
              : "true"
          };
          tasks.config.repeat = Math.abs(tasks.config.repeat - recordQueueConf.finalizeRepeat);
        }
        if (recordQueue.currentlyRetry) {
          tasks.httpRequest.headers = {
            ...tasks.httpRequest.headers,
            "X-Kuueri-Tasks-Queue": queuedId,
            "X-Kuueri-Tasks-Retry-Count": recordQueueConf.retryCount.toString(),
            "X-Kuueri-Tasks-Currently-Retry": recordQueueConf.retryCount === recordQueueConf.retryLimit
              ? "false"
              : "true"
          };
          tasks.config.retry = Math.abs(tasks.config.retry - recordQueueConf.finalizeRetry);
        }

        if (tasks.config.executionAt) {
          tasks.config.executionDelay = 1;
          const next = Math.abs(
            differenceInMilliseconds(recordQueueConf.estimateExecAt, recordQueueConf.estimateEndAt)
          );
          tasks.config.executionAt = addMilliseconds(Date.now(), next).getTime();
        } else {
          tasks.config.executionAt = 0;
          tasks.config.executionDelay = Math.abs(
            differenceInMilliseconds(recordQueueConf.estimateExecAt, recordQueueConf.estimateEndAt)
          );
        }

        const queued = this.register(tasks, {
          currentlyRepeat: recordQueue.currentlyRepeat,
          currentlyRetry: recordQueue.currentlyRetry,
          statusCode: recordQueue.statusCode,
          isPaused: true,
          pId: projectId,
          id: queuedId
        });
        const recordQueued = {
          ...queued,
          metadata: this.aes.encrypt(JSON.stringify(tasks))
        };

        const BATCH_2 = this.redis.pipeline();

        BATCH_2.select(1);
        BATCH_2.hset(this.DB_1(queuedId, projectId), recordQueued);
        BATCH_2.select(2);
        BATCH_2.hset(this.DB_2(queuedId, projectId), {
          estimateExecAt: queued.estimateExecAt,
          estimateEndAt: 0
        });

        if (recordQueue.currentlyRepeat) {
          BATCH_2.hset(this.DB_2(queuedId, projectId), { estimateNextRepeatAt: queued.estimateExecAt });
        }
        if (recordQueue.currentlyRetry) {
          BATCH_2.hset(this.DB_2(queuedId, projectId), { estimateNextRetryAt: queued.estimateExecAt });
        }

        BATCH_2.select(3);

        if (recordQueue.currentlyRepeat) {
          BATCH_2.rpush(this.DB_3(queuedId, projectId), JSON.stringify({
            label: "Resume",
            description: "Re-subscribe task resource. Start repeating task execution",
            createdAt: Date.now()
          }));
        }
        if (recordQueue.currentlyRetry) {
          BATCH_2.rpush(this.DB_3(queuedId, projectId), JSON.stringify({
            label: "Resume",
            description: "Re-subscribe task resource. Start retrying task execution",
            createdAt: Date.now()
          }));
        }
        if (!recordQueue.currentlyRepeat && !recordQueue.currentlyRetry) {
          BATCH_2.rpush(this.DB_3(queuedId, projectId), JSON.stringify({
            label: "Resume",
            description: "Re-subscribe task resource",
            createdAt: Date.now()
          }));
        }

        const copy = queued;
        // @ts-ignore
        copy.pId = undefined;

        return defer(() => BATCH_2.exec()).pipe(
          map(() => copy),
          tap({
            next: () => this.logTimes(tasks, queued)
          })
        );
      })
    );
  }

  public timelineChanges(queuedId: string, projectId: string): Observable<Array<TasksTimeline>> {
    const BATCH = this.redis.pipeline();

    BATCH.select(3);
    BATCH.lrange(this.DB_3(queuedId, projectId), 0, -1);

    return defer(() => BATCH.exec()).pipe(
      map(v => {
        if (v) {
          const r = v[1][1] as unknown as ReadonlyArray<string>;
          if (!isEmpty(r)) {
            return r.map(v => JSON.parse(v) as TasksTimeline)
          }
          throw new NotFoundException();
        }
        throw new NotFoundException();
      })
    );
  }

  public valueChanges(queuedId: string, projectId: string): Observable<{ [f: string]: SafeAny }> {
    const BATCH = this.redis.pipeline();

    BATCH.select(1);
    BATCH.hgetall(this.DB_1(queuedId, projectId));
    BATCH.select(2);
    BATCH.hgetall(this.DB_2(queuedId, projectId));

    return defer(() => BATCH.exec()).pipe(
      map(v => {
        if (v) {
          const record = this.util.toTypes(v[1][1]) as RecordQueue;
          const recordConf = this.util.toTypes(v[3][1]) as RecordQueueConf;
          if (!isEmpty(record) && !isEmpty(recordConf)) {
            const tasks = JSON.parse(this.aes.decrypt(record.metadata)) as TasksReq;

            const executionDelay = recordConf.executionDelay;
            const executionAt = recordConf.executionAt;

            const estimateNextRepeatAt = recordConf.estimateNextRepeatAt;
            const estimateNextRetryAt = recordConf.estimateNextRetryAt;

            const repeatLimit = recordConf.repeatLimit;
            const retryLimit = recordConf.retryLimit;

            const repeatCount = recordConf.finalizeRepeat;
            const retryCount = recordConf.finalizeRetry;

            // Remove unused field
            // @ts-ignore
            record.metadata = undefined;
            // @ts-ignore
            record.pId = undefined;

            // @ts-ignore
            recordConf.estimateNextRepeatAt = undefined;
            // @ts-ignore
            recordConf.estimateNextRetryAt = undefined;

            // @ts-ignore
            recordConf.estimateExecAt = undefined;
            // @ts-ignore
            recordConf.executionDelay = undefined;
            // @ts-ignore
            recordConf.estimateEndAt = undefined;
            // @ts-ignore
            recordConf.executionAt = undefined;

            // @ts-ignore
            recordConf.finalizeRepeat = undefined;
            // @ts-ignore
            recordConf.finalizeRetry = undefined;

            return {
              ...record,
              config: {
                ...this.util.sortFields({
                  ...tasks.config,
                  executionDelay,
                  executionAt,
                  repeat: repeatLimit,
                  retry: retryLimit
                })
              },
              updates: {
                ...this.util.sortFields({
                  ...recordConf,
                  onError: {
                    estimateNextRetryAt
                  },
                  onComplete: {
                    estimateNextRepeatAt
                  },
                  repeatCount,
                  retryCount
                })
              }
            };
          }
          throw new NotFoundException();
        }
        throw new NotFoundException();
      })
    );
  }

  private register(data: TasksReq, option: RegisterOption): Queued {
    const today = Date.now();
    const queuedId = option?.id || randomBytes(4).toString("hex").toUpperCase() + today.toString();
    const todayAddMs = addMilliseconds(today, data.config.executionDelay).getTime();
    const dueDateTimer = !!data.config.executionAt
      ? new Date(data.config.executionAt)
      : data.config.executionDelay;

    this.stackQueued.push({
      id: queuedId,
      pId: option.pId,
      state: "RUNNING",
      estimateEndAt: 0,
      estimateExecAt: !!data.config.executionAt
        ? new Date(data.config.executionAt).getTime()
        : todayAddMs,
      estimateStartAt: today,
      currentlyRetry: !!option.currentlyRetry,
      currentlyRepeat: !!option.currentlyRepeat,
      statusCode: option.statusCode || 0,
      // This could be any observable stream
      subscription: timer(dueDateTimer).pipe(
        // Map to inner observable, ignore other values until that observable completes
        exhaustMap(() => {
          let httpConf = {
            url: data.httpRequest.url,
            data: data.httpRequest?.data,
            method: data.httpRequest.method,
            params: data.httpRequest?.params,
            headers: { ...data.httpRequest?.headers, "User-Agent": "Kuueri-Tasks" } as { [f: string]: string },
            timeout: data.config.timeout
          };

          let statusCode = 0;

          let isFirstNext = true;
          let isFirstError = true;

          // Generates HTTP response Observable as output
          // Make an Observable for each new Observer
          const http$ = defer(() => this.http.request(httpConf)).pipe(
            // Perform actions or side-effects, such as logging
            tap({
              // A next handler or partial observer
              // On first complete
              next: async response => {
                statusCode = response.status;
                const BATCH_NEXT = this.redis.pipeline();

                BATCH_NEXT.select(1);
                BATCH_NEXT.hset(this.DB_1(queuedId, option.pId), { statusCode });

                BATCH_NEXT.exec();

                if (isFirstNext) {
                  if (option.isRepeatTerminated || (option.isPaused && option.currentlyRepeat)) {
                    const BATCH_NEXT_REPEAT = this.redis.pipeline();

                    BATCH_NEXT_REPEAT.select(2);
                    BATCH_NEXT_REPEAT.hincrby(this.DB_2(queuedId, option.pId), "finalizeRepeat", 1);

                    if (data.config.repeatAt === 0 && (data.config.repeat || data.config.repeat === 0)) {
                      const BATCH_NEXT_REPEAT_COUNT = this.redis.pipeline();

                      BATCH_NEXT_REPEAT_COUNT.select(2);
                      BATCH_NEXT_REPEAT_COUNT.hget(this.DB_2(queuedId, option.pId), "finalizeRepeat");

                      const vBATCH_NEXT_REPEAT_COUNT = await BATCH_NEXT_REPEAT_COUNT.exec();
                      const repeatCount = toSafeInteger(vBATCH_NEXT_REPEAT_COUNT![1][1]) + 1;

                      BATCH_NEXT_REPEAT.select(3);
                      BATCH_NEXT_REPEAT.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
                        label: "Repeat",
                        description: "Success with status code " + response.status,
                        createdAt: Date.now(),
                        metadata: {
                          repeatCount
                        }
                      }));
                    }

                    if (data.config.repeatAt) {
                      const queued = this.stackQueued.find(q => q.id === queuedId);

                      BATCH_NEXT_REPEAT.select(3);
                      BATCH_NEXT_REPEAT.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
                        label: "Repeat",
                        description: "Success with status code " + statusCode,
                        createdAt: Date.now(),
                        metadata: {
                          repeatAt: queued?.estimateExecAt
                        }
                      }));
                    }

                    BATCH_NEXT_REPEAT.exec();
                  }

                  if (this.level === "DEVELOPMENT") {
                    this.logger.log("Queued:" + queuedId + ":INITIAL");
                  }

                  isFirstNext = false;
                }
              },
              // On first error
              error: async e => {
                const BATCH_ERROR = this.redis.pipeline();

                BATCH_ERROR.select(1);
                BATCH_ERROR.hset(this.DB_1(queuedId, option.pId), { statusCode });

                BATCH_ERROR.exec();

                if (isFirstError) {
                  statusCode = this.util.toStatusCode(e);

                  if (option.isRetryTerminated || (option.isPaused && option.currentlyRetry)) {
                    const BATCH_ERROR_RETRY = this.redis.pipeline();

                    BATCH_ERROR_RETRY.select(2);
                    BATCH_ERROR_RETRY.hincrby(this.DB_2(queuedId, option.pId), "finalizeRetry", 1);

                    if (data.config.retryAt === 0 && (data.config.retry || data.config.retry === 0)) {
                      const BATCH_ERROR_RETRY_COUNT = this.redis.pipeline();

                      BATCH_ERROR_RETRY_COUNT.select(2);
                      BATCH_ERROR_RETRY_COUNT.hget(this.DB_2(queuedId, option.pId), "finalizeRetry");

                      const vBATCH_ERROR_RETRY_COUNT = await BATCH_ERROR_RETRY_COUNT.exec();
                      const retryCount = toSafeInteger(vBATCH_ERROR_RETRY_COUNT![1][1]) + 1;

                      BATCH_ERROR_RETRY.select(3);
                      BATCH_ERROR_RETRY.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
                        label: "Retry",
                        description: "Error with status code " + statusCode,
                        createdAt: Date.now(),
                        metadata: {
                          retryCount
                        }
                      }));
                    }

                    if (data.config.retryAt) {
                      const queued = this.stackQueued.find(q => q.id === queuedId);

                      BATCH_ERROR_RETRY.select(3);
                      BATCH_ERROR_RETRY.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
                        label: "Retry",
                        description: "Error with status code " + statusCode,
                        createdAt: Date.now(),
                        metadata: {
                          retryAt: queued?.estimateExecAt
                        }
                      }));
                    }

                    BATCH_ERROR_RETRY.exec();
                  }

                  if (this.level === "DEVELOPMENT") {
                    this.logger.error("Queued:" + queuedId + ":INITIAL");
                  }

                  isFirstError = false;
                }
              }
            }),
            // Transform HTTP response
            map(() => null as Done)
          );
          // Handle HTTP request
          return http$.pipe(
            // Retry an observable sequence a specific number of times should an error occur
            data.config.retry === 0 && data.config.retryAt === 0
              ? map(identity)
              : retry({
                  count: !!option.isRetryTerminated || (!!option.isPaused && !!option.currentlyRetry)
                    ? data.config.retry - 1
                    : data.config.retry,
                  delay: e => {
                    statusCode = this.util.toStatusCode(e);
                    const today = Date.now();

                    if (data.config.retryAt) {
                      const dueDate = new Date(data.config.retryAt);
                      const retryInterval = differenceInMilliseconds(data.config.retryAt, today);
                      const BATCH_RETRY_AT = this.redis.pipeline();

                      BATCH_RETRY_AT.select(1);
                      BATCH_RETRY_AT.hset(this.DB_1(queuedId, option.pId), {
                        currentlyRepeat: false,
                        currentlyRetry: true,
                        estimateExecAt: data.config.retryAt,
                        statusCode
                      });
                      BATCH_RETRY_AT.select(2);
                      BATCH_RETRY_AT.hset(this.DB_2(queuedId, option.pId), {
                        estimateNextRepeatAt: 0,
                        estimateNextRetryAt: data.config.retryAt,
                        estimateExecAt: data.config.retryAt
                      });
                      BATCH_RETRY_AT.select(3);
                      BATCH_RETRY_AT.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
                        label: "Error",
                        description: "Error with status code " + statusCode + ". Start retrying task execution",
                        createdAt: Date.now()
                      }));

                      BATCH_RETRY_AT.exec();

                      return timer(dueDate).pipe(
                        tap({
                          next: () => {
                            const BATCH_END_RETRY_AT = this.redis.pipeline();

                            BATCH_END_RETRY_AT.select(2);
                            BATCH_END_RETRY_AT.hincrby(this.DB_2(queuedId, option.pId), "finalizeRetry", 1);
                            BATCH_END_RETRY_AT.select(3);
                            BATCH_END_RETRY_AT.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
                              label: "Retry",
                              description: "Error with status code " + statusCode,
                              createdAt: Date.now(),
                              metadata: {
                                retryAt: data.config.retryAt
                              }
                            }));

                            BATCH_END_RETRY_AT.exec();

                            httpConf = {
                              ...httpConf,
                              headers: {
                                ...httpConf.headers,
                                "X-Kuueri-Tasks-Queue": queuedId,
                                "X-Kuueri-Tasks-Retry-Count": "1",
                                "X-Kuueri-Tasks-Currently-Retry": "false"
                              }
                            };

                            // Log timing on console
                            if (this.level === "DEVELOPMENT") {
                              this.logger.error("Queued:" + queuedId + ":C=" + 1 + ":D=" + retryInterval);
                            }
                          }
                        })
                      );
                    }

                    const BATCH_RETRY_1 = this.redis.pipeline();

                    BATCH_RETRY_1.select(2);
                    BATCH_RETRY_1.hincrby(this.DB_2(queuedId, option.pId), "retryCount", 1);
                    BATCH_RETRY_1.hget(this.DB_2(queuedId, option.pId), "retryLimit");

                    return defer(() => BATCH_RETRY_1.exec()).pipe(
                      map(v => ({
                        retryCount: toSafeInteger(v![1][1]),
                        retryLimit: toSafeInteger(v![2][1])
                      })),
                      switchMap(({ retryCount, retryLimit }) => {
                        const dueMS = data.config.retryExponential
                          ? data.config.retryInterval * retryCount
                          : data.config.retryInterval;

                        const retryAt = addMilliseconds(today, dueMS).getTime();
                        const BATCH_RETRY_2 = this.redis.pipeline();

                        BATCH_RETRY_2.select(1);
                        BATCH_RETRY_2.hset(this.DB_1(queuedId, option.pId), {
                          currentlyRepeat: false,
                          currentlyRetry: true,
                          estimateExecAt: retryAt,
                          statusCode
                        });
                        BATCH_RETRY_2.select(2);
                        BATCH_RETRY_2.hset(this.DB_2(queuedId, option.pId), {
                          estimateNextRepeatAt: 0,
                          estimateNextRetryAt: retryAt,
                          estimateExecAt: retryAt
                        });

                        if (retryCount === 1) {
                          BATCH_RETRY_2.select(3);
                          BATCH_RETRY_2.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
                            label: "Error",
                            description: "Error with status code " + statusCode + ". Start retrying task execution",
                            createdAt: Date.now()
                          }));
                        }

                        BATCH_RETRY_2.exec();

                        return timer(dueMS).pipe(
                          tap({
                            next: () => {
                              const BATCH_END_RETRY = this.redis.pipeline();

                              BATCH_END_RETRY.select(2);
                              BATCH_END_RETRY.hincrby(this.DB_2(queuedId, option.pId), "finalizeRetry", 1);
                              BATCH_END_RETRY.select(3);
                              BATCH_END_RETRY.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
                                label: "Retry",
                                description: "Error with status code " + statusCode,
                                createdAt: Date.now(),
                                metadata: {
                                  retryCount
                                }
                              }));

                              BATCH_END_RETRY.exec();

                              httpConf = {
                                ...httpConf,
                                headers: {
                                  ...httpConf.headers,
                                  "X-Kuueri-Tasks-Queue": queuedId,
                                  "X-Kuueri-Tasks-Retry-Count": retryCount.toString(),
                                  "X-Kuueri-Tasks-Currently-Retry": retryCount === retryLimit
                                    ? "false"
                                    : "true"
                                }
                              };

                              if (this.level === "DEVELOPMENT") {
                                if (data.config.retryExponential) {
                                  this.logger.error("Queued:" + queuedId + ":C=" + retryCount + ":D=" + data.config.retryInterval * retryCount);
                                } else {
                                  this.logger.error("Queued:" + queuedId + ":C=" + retryCount + ":D=" + data.config.retryInterval);
                                }
                              }
                            }
                          })
                        );
                      })
                    );
                  }
                }),
            // Repeats an observable on completion
            data.config.repeat === 0 && data.config.repeatAt
              ? map(identity)
              : repeat({
                  count: !!option.isRepeatTerminated || (!!option.isPaused && !!option.currentlyRepeat)
                    ? data.config.repeat
                    : data.config.repeat + 1,
                  delay: () => {
                    const today = Date.now();

                    if (data.config.repeatAt) {
                      const dueDate = new Date(data.config.repeatAt);
                      const repeatInterval = differenceInMilliseconds(data.config.repeatAt, today);
                      const BATCH_REPEAT_AT = this.redis.pipeline();

                      BATCH_REPEAT_AT.select(1);
                      BATCH_REPEAT_AT.hset(this.DB_1(queuedId, option.pId), {
                        currentlyRepeat: true,
                        currentlyRetry: false,
                        estimateExecAt: data.config.repeatAt,
                        statusCode
                      });
                      BATCH_REPEAT_AT.select(2);
                      BATCH_REPEAT_AT.hset(this.DB_2(queuedId, option.pId), {
                        estimateNextRepeatAt: data.config.repeatAt,
                        estimateNextRetryAt: 0,
                        estimateExecAt: data.config.repeatAt
                      });
                      BATCH_REPEAT_AT.select(3);
                      BATCH_REPEAT_AT.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
                        label: "Complete",
                        description: "Success with status code " + statusCode + ". Start repeating task execution",
                        createdAt: Date.now()
                      }));

                      BATCH_REPEAT_AT.exec();

                      return timer(dueDate).pipe(
                        tap({
                          next: () => {
                            const BATCH_END_REPEAT_AT = this.redis.pipeline();

                            BATCH_END_REPEAT_AT.select(2);
                            BATCH_END_REPEAT_AT.hincrby(this.DB_2(queuedId, option.pId), "finalizeRepeat", 1);
                            BATCH_END_REPEAT_AT.select(3);
                            BATCH_END_REPEAT_AT.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
                              label: "Repeat",
                              description: "Success with status code " + statusCode,
                              createdAt: Date.now(),
                              metadata: {
                                repeatAt: data.config.repeatAt
                              }
                            }));

                            BATCH_END_REPEAT_AT.exec();

                            httpConf = {
                              ...httpConf,
                              headers: {
                                ...httpConf.headers,
                                "X-Kuueri-Tasks-Queue": queuedId,
                                "X-Kuueri-Tasks-Repeat-Count": "1",
                                "X-Kuueri-Tasks-Currently-Repeat": "false"
                              }
                            };

                            // Log timing on console
                            if (this.level === "DEVELOPMENT") {
                              this.logger.log("Queued:" + queuedId + ":C=" + 1 + ":D=" + repeatInterval);
                            }
                          }
                        })
                      );
                    }

                    const BATCH_REPEAT_1 = this.redis.pipeline();

                    BATCH_REPEAT_1.select(2);
                    BATCH_REPEAT_1.hincrby(this.DB_2(queuedId, option.pId), "repeatCount", 1);
                    BATCH_REPEAT_1.hget(this.DB_2(queuedId, option.pId), "repeatLimit");

                    return defer(() => BATCH_REPEAT_1.exec()).pipe(
                      map(v => ({
                        repeatCount: toSafeInteger(v![1][1]),
                        repeatLimit: toSafeInteger(v![2][1])
                      })),
                      switchMap(({ repeatCount, repeatLimit }) => {
                        const dueMS = data.config.repeatExponential
                          ? data.config.repeatInterval * repeatCount
                          : data.config.repeatInterval;

                        const repeatAt = addMilliseconds(today, dueMS).getTime();
                        const BATCH_REPEAT_2 = this.redis.pipeline();

                        BATCH_REPEAT_2.select(1);
                        BATCH_REPEAT_2.hset(this.DB_1(queuedId, option.pId), {
                          currentlyRepeat: true,
                          currentlyRetry: false,
                          estimateExecAt: repeatAt,
                          statusCode: statusCode
                        });
                        BATCH_REPEAT_2.select(2);
                        BATCH_REPEAT_2.hset(this.DB_2(queuedId, option.pId), {
                          estimateNextRepeatAt: repeatAt,
                          estimateNextRetryAt: 0,
                          estimateExecAt: repeatAt
                        });

                        if (repeatCount === 1) {
                          BATCH_REPEAT_2.select(3);
                          BATCH_REPEAT_2.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
                            label: "Complete",
                            description: "Success with status code " + statusCode + ". Start repeating task execution",
                            createdAt: Date.now()
                          }));
                        }

                        BATCH_REPEAT_2.exec();

                        return timer(dueMS).pipe(
                          tap({
                            next: () => {
                              const BATCH_END_REPEAT = this.redis.pipeline();

                              BATCH_END_REPEAT.select(2);
                              BATCH_END_REPEAT.hincrby(this.DB_2(queuedId, option.pId), "finalizeRepeat", 1);
                              BATCH_END_REPEAT.select(3);
                              BATCH_END_REPEAT.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
                                label: "Repeat",
                                description: "Success with status code " + statusCode,
                                createdAt: Date.now(),
                                metadata: {
                                  repeatCount
                                }
                              }));

                              BATCH_END_REPEAT.exec();

                              httpConf = {
                                ...httpConf,
                                headers: {
                                  ...httpConf.headers,
                                  "X-Kuueri-Tasks-Queue": queuedId,
                                  "X-Kuueri-Tasks-Repeat-Count": repeatCount.toString(),
                                  "X-Kuueri-Tasks-Currently-Repeat": repeatCount === repeatLimit
                                    ? "false"
                                    : "true"
                                }
                              };

                              if (this.level === "DEVELOPMENT") {
                                if (data.config.retryExponential) {
                                  this.logger.log("Queued:" + queuedId + ":C=" + repeatCount + ":D=" + data.config.repeatInterval * repeatCount);
                                } else {
                                  this.logger.log("Queued:" + queuedId + ":C=" + repeatCount + ":D=" + data.config.repeatInterval);
                                }
                              }
                            }
                          })
                        );
                      })
                    );
                  }
                })
          );
        })
      )
      .subscribe({
        // Observer got an error
        error: e => {
          this.logger.error("Dequeue:" + queuedId + " " + toString(e));

          const today = Date.now();
          const statusCode = this.util.toStatusCode(e);
          const BATCH_ERROR = this.redis.pipeline();

          BATCH_ERROR.select(0);
          BATCH_ERROR.hincrby(option.pId, "taskInQueue", -1);

          BATCH_ERROR.select(1);
          BATCH_ERROR.hset(this.DB_1(queuedId, option.pId), {
            estimateExecAt: 0,
            estimateEndAt: today,
            currentlyRepeat: false,
            currentlyRetry: false,
            statusCode,
            state: "ERROR"
          });
          BATCH_ERROR.expire(this.DB_1(queuedId, option.pId), this.DEFAULT_EXPIRATION);
          BATCH_ERROR.select(2);
          BATCH_ERROR.hset(this.DB_2(queuedId, option.pId), {
            estimateNextRepeatAt: 0,
            estimateNextRetryAt: 0,
            estimateExecAt: 0,
            estimateEndAt: today
          });
          BATCH_ERROR.expire(this.DB_2(queuedId, option.pId), this.DEFAULT_EXPIRATION);
          BATCH_ERROR.select(3);
          BATCH_ERROR.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
            label: "Error",
            description: toString(e),
            createdAt: Date.now()
          }));
          BATCH_ERROR.expire(this.DB_3(queuedId, option.pId), this.DEFAULT_EXPIRATION);

          BATCH_ERROR.exec();
        },
        // Observer got a complete notification
        complete: () => {
          this.logger.log("Dequeue:" + queuedId);

          const today = Date.now();
          const BATCH_COMPLETE = this.redis.pipeline();

          BATCH_COMPLETE.select(0);
          BATCH_COMPLETE.hincrby(option.pId, "taskInQueue", -1);

          BATCH_COMPLETE.select(1);
          BATCH_COMPLETE.hset(this.DB_1(queuedId, option.pId), {
            estimateExecAt: 0,
            estimateEndAt: today,
            currentlyRepeat: false,
            currentlyRetry: false,
            state: "COMPLETED"
          });
          BATCH_COMPLETE.expire(this.DB_1(queuedId, option.pId), this.DEFAULT_EXPIRATION);
          BATCH_COMPLETE.select(2);
          BATCH_COMPLETE.hset(this.DB_2(queuedId, option.pId), {
            estimateNextRepeatAt: 0,
            estimateNextRetryAt: 0,
            estimateExecAt: 0,
            estimateEndAt: today
          });
          BATCH_COMPLETE.expire(this.DB_2(queuedId, option.pId), this.DEFAULT_EXPIRATION);
          BATCH_COMPLETE.select(3);
          BATCH_COMPLETE.rpush(this.DB_3(queuedId, option.pId), JSON.stringify({
            label: "Complete",
            description: "Task has been executed successfully",
            createdAt: Date.now()
          }));
          BATCH_COMPLETE.expire(this.DB_3(queuedId, option.pId), this.DEFAULT_EXPIRATION);

          BATCH_COMPLETE.exec();
        }
      }),
      config: data.config
    });

    const registered = this.stackQueued.find(q => q.id === queuedId)!;
    // Destructuring some field to get queued
    const { subscription, config, ...queued } = registered;
    return queued as Queued;
  }

  private DB_1(id: string, projectId: string): string {
    return "RC:QU:" + id + ":" + projectId;
  }

  private DB_2(id: string, projectId: string): string {
    return "RC:CF:" + id + ":" + projectId;
  }

  private DB_3(id: string, projectId: string): string {
    return "RC:TL:" + id + ":" + projectId;
  }

  private logTimes(tasks: TasksReq, queued: Queued): void {
    if (this.level === "DEVELOPMENT") {
      if (tasks.config.repeatAt === 0 && tasks.config.repeat) {
        const stream = createWriteStream("./note.repeat.txt", "utf-8");
        if (tasks.config.repeatExponential) {
          let execAt = queued.estimateExecAt;
          const times: Array<string> = [];
          for (let i = 0; i <= tasks.config.repeat; i++) {
            const count = tasks.config.repeatInterval * i;
            execAt += count;
            if (i === 0) {
              times.push("INITIAL EXECUTION AT => " + new Date(execAt).toLocaleString());
            } else {
              times.push("ON COMPLETE, ESTIMATE REPEAT-" + i + " AT => " + new Date(execAt).toLocaleString());
            }
          }
          stream.write(queued.id + "\n\n" + times.join("\n"));
          stream.end();
        } else {
          let execAt = queued.estimateExecAt - tasks.config.repeatInterval;
          const times: Array<string> = [];
          for (let i = 0; i <= tasks.config.repeat; i++) {
            execAt += tasks.config.repeatInterval;
            if (i === 0) {
              times.push("INITIAL EXECUTION AT => " + new Date(execAt).toLocaleString());
            } else {
              times.push("ON COMPLETE, ESTIMATE REPEAT-" + i + " AT => " + new Date(execAt).toLocaleString());
            }
          }
          stream.write(queued.id + "\n\n" + times.join("\n"));
          stream.end();
        }
      }

      if (tasks.config.repeatAt) {
        const stream = createWriteStream("./note.repeat.txt", "utf-8");
        const content =
          "INITIAL EXECUTION AT => " + new Date(queued.estimateExecAt).toLocaleString()
          + "\n" + "ON COMPLETE, REPEAT AT => " + new Date(tasks.config.repeatAt).toLocaleString();
        stream.write(queued.id + "\n\n" + content);
        stream.end();
      }

      if (tasks.config.retryAt === 0 && tasks.config.retry) {
        const stream = createWriteStream("./note.retry.txt", "utf-8");
        if (tasks.config.retryExponential) {
          let execAt = queued.estimateExecAt;
          const times: Array<string> = [];
          for (let i = 0; i <= tasks.config.retry; i++) {
            const count = tasks.config.retryInterval * i;
            execAt += count;
            if (i === 0) {
              times.push("INITIAL EXECUTION AT => " + new Date(execAt).toLocaleString());
            } else {
              times.push("ON ERROR, ESTIMATE RETRY-" + i + " AT => " + new Date(execAt).toLocaleString());
            }
          }
          stream.write(queued.id + "\n\n" + times.join("\n"));
          stream.end();
        } else {
          let execAt = queued.estimateExecAt - tasks.config.retryInterval;
          const times: Array<string> = [];
          for (let i = 0; i <= tasks.config.retry; i++) {
            execAt += tasks.config.retryInterval;
            if (i === 0) {
              times.push("INITIAL EXECUTION AT => " + new Date(execAt).toLocaleString());
            } else {
              times.push("ON ERROR, ESTIMATE RETRY-" + i + " AT => " + new Date(execAt).toLocaleString());
            }
          }
          stream.write(queued.id + "\n\n" + times.join("\n"));
          stream.end();
        }
      }

      if (tasks.config.retryAt) {
        const stream = createWriteStream("./note.retry.txt", "utf-8");
        const content =
          "INITIAL EXECUTION AT => " + new Date(queued.estimateExecAt).toLocaleString()
          + "\n" + "ON ERROR, ESTIMATE RETRY AT => " + new Date(tasks.config.retryAt).toLocaleString();
        stream.write(queued.id + "\n\n" + content);
        stream.end();
      }
    }
  }

  private async trackChanges(): Promise<void> {
    if (this.isInitialize) {
      return;
    }

    const MONIT = await this.redis.monitor();

    MONIT.on("monitor", (_: string, args: ReadonlyArray<string>, __: string, db: string) => {
      if (db === "1") {
        const odd = args.filter((_, i) => i % 2 !== 0);
        const even = args.filter((_, i) => i % 2 === 0);

        if (even.includes("hset")) {
          const response = zipObject(even, odd) as Readonly<{ [f: string]: string }>;

          if ("state" in response) {
            const state = response.state as StateQueue;
            const queueId = response.hset.split(":")[2];

            if (state === "COMPLETED" || state === "ERROR") {
              this.stackQueued = this.stackQueued.filter(q => !(q.subscription.closed));
            }

            if (state === "CANCELED" || state === "PAUSED") {
              const i = this.stackQueued.findIndex(q => q?.id === queueId);
              if (i !== -1) {
                // Disposes the resources held by the subscription
                this.stackQueued[i].subscription.unsubscribe();
                this.stackQueued = this.stackQueued.filter(q => !(q.subscription.closed));
              }
            }
          }
        }
      }
    });
  }

  private async resubscribe(): Promise<void> {
    if (this.level === "PRODUCTION" && (this.isInitialize || process.env.NODE_APP_INSTANCE !== "0")) {
      return;
    }

    let keys: ReadonlyArray<string> = [];
    const BATCH_1 = this.redis.pipeline();

    BATCH_1.select(1);
    BATCH_1.keys("*", (e, r) => {
      if (r) {
        keys = r;
      }
    });

    await BATCH_1.exec();

    if (keys.length) {
      let recordsQueue: Array<RecordQueue> = [];
      const BATCH_2 = this.redis.pipeline();

      BATCH_2.select(1);

      for (let i = 0; i < keys.length; i++) {
        BATCH_2.hgetall(keys[i], (e, r) => {
          if (r && r.state === "RUNNING") {
            // @ts-ignore
            recordsQueue.push(this.util.toTypes<RecordQueue>(r));
          }
        });
      }

      await BATCH_2.exec();

      if (recordsQueue.length) {
        const BATCH_3 = this.redis.pipeline();
        for (let i = 0; i < recordsQueue.length; i++) {
          const queue = recordsQueue[i];
          const metadata = JSON.parse(this.aes.decrypt(queue.metadata)) as TasksReq;
          // On date next
          if (isFuture(queue.estimateExecAt)) {
            if (queue.currentlyRepeat) {
              const tasksState: TasksReq = {
                httpRequest: { ...metadata.httpRequest },
                config: { ...metadata.config }
              };
              // On repeat
              if (tasksState.config.repeatAt === 0 && tasksState.config.repeat) {
                const tasks: TasksReq = {
                  httpRequest: { ...metadata.httpRequest },
                  config: { ...metadata.config }
                };

                BATCH_3.select(2);
                BATCH_3.hgetall(this.DB_2(queue.id, queue.pId), (e, r) => {
                  if (r) {
                    const recordQueueConf = this.util.toTypes(r) as unknown as RecordQueueConf;
                    tasks.httpRequest.headers = {
                      ...tasks.httpRequest.headers,
                      "X-Kuueri-Tasks-Queue": queue.id,
                      "X-Kuueri-Tasks-Repeat-Count": recordQueueConf.repeatCount.toString(),
                      "X-Kuueri-Tasks-Currently-Repeat": recordQueueConf.repeatCount === recordQueueConf.repeatLimit
                        ? "false"
                        : "true"
                    };
                    tasks.config.repeat = Math.abs(tasks.config.repeat - recordQueueConf.finalizeRepeat);
                  }
                });

                const diffMS = differenceInMilliseconds(queue.estimateExecAt, Date.now());
                tasks.config.executionDelay = diffMS;

                const queued = this.register(tasks, {
                  isRepeatTerminated: true,
                  currentlyRepeat: true,
                  statusCode: queue.statusCode,
                  pId: queue.pId,
                  id: queue.id
                });
                const recordQueued: RecordQueue = {
                  ...queued,
                  metadata: this.aes.encrypt(JSON.stringify(tasks))
                };

                BATCH_3.select(1);
                BATCH_3.hset(this.DB_1(queue.id, queue.pId), recordQueued);
                BATCH_3.select(2);
                BATCH_3.hset(this.DB_2(queue.id, queue.pId), {
                  estimateNextRepeatAt: queued.estimateExecAt,
                  estimateExecAt: queued.estimateExecAt,
                  isRepeatTerminated: true
                });
                BATCH_3.select(3);
                BATCH_3.rpush(this.DB_3(queue.id, queue.pId), JSON.stringify({
                  label: "Alert",
                  description: "Server back to online. Start repeating task execution",
                  createdAt: Date.now()
                }));
              }

              // On repeatAt
              if (tasksState.config.repeatAt) {
                if (isFuture(tasksState.config.repeatAt)) {
                  const tasks: TasksReq = {
                    httpRequest: { ...metadata.httpRequest },
                    config: { ...metadata.config }
                  };

                  tasks.httpRequest.headers = {
                    ...tasks.httpRequest.headers,
                    "X-Kuueri-Tasks-Queue": queue.id,
                    "X-Kuueri-Tasks-Repeat-Count": "1",
                    "X-Kuueri-Tasks-Currently-Repeat": "false"
                  };

                  const diffMS = differenceInMilliseconds(tasks.config.repeatAt, Date.now());
                  tasks.config.executionDelay = diffMS;

                  const queued = this.register(tasks, {
                    isRepeatTerminated: true,
                    currentlyRepeat: true,
                    pId: queue.pId,
                    id: queue.id
                  });
                  const recordQueued: RecordQueue = {
                    ...queued,
                    metadata: this.aes.encrypt(JSON.stringify(tasks))
                  };

                  BATCH_3.select(1);
                  BATCH_3.hset(this.DB_1(queue.id, queue.pId), recordQueued);
                  BATCH_3.select(2);
                  BATCH_3.hset(this.DB_2(queue.id, queue.pId), {
                    estimateNextRepeatAt: tasks.config.repeatAt,
                    estimateExecAt: tasks.config.repeatAt,
                    isRepeatTerminated: true
                  });
                  BATCH_3.select(3);
                  BATCH_3.rpush(this.DB_3(queue.id, queue.pId), JSON.stringify({
                    label: "Alert",
                    description: "Server back to online. Start repeating task execution",
                    createdAt: Date.now()
                  }));
                } else {
                  // On repeatAt is yesterday
                  const recordQueued: RecordQueue = {
                    ...queue,
                    estimateExecAt: 0,
                    estimateEndAt: Date.now(),
                    state: "EXCEEDED"
                  };

                  BATCH_3.select(0);
                  BATCH_3.hincrby(queue.pId, "taskInQueue", -1);

                  BATCH_3.select(1);
                  BATCH_3.hset(this.DB_1(queue.id, queue.pId), recordQueued);
                  BATCH_3.expire(this.DB_1(queue.id, queue.pId), this.DEFAULT_EXPIRATION);
                  BATCH_3.select(2);
                  BATCH_3.hset(this.DB_2(queue.id, queue.pId), {
                    estimateNextRepeatAt: 0,
                    estimateNextRetryAt: 0,
                    estimateExecAt: 0,
                    estimateEndAt: recordQueued.estimateEndAt
                  });
                  BATCH_3.expire(this.DB_2(queue.id, queue.pId), this.DEFAULT_EXPIRATION);
                  BATCH_3.select(3);
                  BATCH_3.rpush(this.DB_3(queue.id, queue.pId), JSON.stringify({
                    label: "Exceeded",
                    description: "Execution time has exceeded than the current time",
                    createdAt: Date.now()
                  }));
                  BATCH_3.expire(this.DB_3(queue.id, queue.pId), this.DEFAULT_EXPIRATION);
                }
              }
            }

            if (queue.currentlyRetry) {
              const tasksState: TasksReq = {
                httpRequest: { ...metadata.httpRequest },
                config: { ...metadata.config }
              };
              // On retry
              if (tasksState.config.retryAt === 0 && tasksState.config.retry) {
                const tasks: TasksReq = {
                  httpRequest: { ...metadata.httpRequest },
                  config: { ...metadata.config }
                };

                BATCH_3.select(2);
                BATCH_3.hgetall(this.DB_2(queue.id, queue.pId), (e, r) => {
                  if (r) {
                    const recordQueueConf = this.util.toTypes(r) as unknown as RecordQueueConf;
                    tasks.httpRequest.headers = {
                      "X-Kuueri-Tasks-Queue": queue.id,
                      "X-Kuueri-Tasks-Retry-Count": recordQueueConf.retryCount.toString(),
                      "X-Kuueri-Tasks-Currently-Retry": recordQueueConf.retryCount === recordQueueConf.retryLimit
                        ? "false"
                        : "true"
                    };
                    tasks.config.retry = Math.abs(tasks.config.retry - recordQueueConf.finalizeRetry);
                  }
                });

                const diffMS = differenceInMilliseconds(queue.estimateExecAt, Date.now());
                tasks.config.executionDelay = diffMS;

                const queued = this.register(tasks, {
                  isRetryTerminated: true,
                  currentlyRetry: true,
                  statusCode: queue.statusCode,
                  pId: queue.pId,
                  id: queue.id
                });
                const recordQueued: RecordQueue = {
                  ...queued,
                  metadata: this.aes.encrypt(JSON.stringify(tasks))
                };

                BATCH_3.select(1);
                BATCH_3.hset(this.DB_1(queue.id, queue.pId), recordQueued);
                BATCH_3.select(2);
                BATCH_3.hset(this.DB_2(queue.id, queue.pId), {
                  estimateNextRetryAt: queued.estimateExecAt,
                  estimateExecAt: queued.estimateExecAt,
                  isRetryTerminated: true
                });
                BATCH_3.select(3);
                BATCH_3.rpush(this.DB_3(queue.id, queue.pId), JSON.stringify({
                  label: "Alert",
                  description: "Server back to online. Start retrying task execution",
                  createdAt: Date.now()
                }));
              }

              // On retryAt
              if (tasksState.config.retryAt) {
                if (isFuture(tasksState.config.retryAt)) {
                  const tasks: TasksReq = {
                    httpRequest: { ...metadata.httpRequest },
                    config: { ...metadata.config }
                  };

                  tasks.httpRequest.headers = {
                    ...tasks.httpRequest.headers,
                    "X-Kuueri-Tasks-Queue": queue.id,
                    "X-Kuueri-Tasks-Retry-Count": "1",
                    "X-Kuueri-Tasks-Currently-Retry": "false"
                  };

                  const diffMS = differenceInMilliseconds(tasks.config.retryAt, Date.now());
                  tasks.config.executionDelay = diffMS;

                  const queued = this.register(tasks, {
                    isRetryTerminated: true,
                    currentlyRetry: true,
                    statusCode: queue.statusCode,
                    pId: queue.pId,
                    id: queue.id
                  });
                  const recordQueued: RecordQueue = {
                    ...queued,
                    metadata: this.aes.encrypt(JSON.stringify(tasks))
                  };

                  BATCH_3.select(1);
                  BATCH_3.hset(this.DB_1(queue.id, queue.pId), recordQueued);
                  BATCH_3.select(2);
                  BATCH_3.hset(this.DB_2(queue.id, queue.pId), {
                    estimateNextRetryAt: queued.estimateExecAt,
                    estimateExecAt: queued.estimateExecAt,
                    isRetryTerminated: true
                  });
                  BATCH_3.select(3);
                  BATCH_3.rpush(this.DB_3(queue.id, queue.pId), JSON.stringify({
                    label: "Alert",
                    description: "Server back to online. Start retrying task execution",
                    createdAt: Date.now()
                  }));
                } else {
                  // On retryAt is yesterday
                  const recordQueued: RecordQueue = {
                    ...queue,
                    estimateExecAt: 0,
                    estimateEndAt: Date.now(),
                    state: "EXCEEDED"
                  };

                  BATCH_3.select(0);
                  BATCH_3.hincrby(queue.pId, "taskInQueue", -1);

                  BATCH_3.select(1);
                  BATCH_3.hset(this.DB_1(queue.id, queue.pId), recordQueued);
                  BATCH_3.expire(this.DB_1(queue.id, queue.pId), this.DEFAULT_EXPIRATION);
                  BATCH_3.select(2);
                  BATCH_3.hset(this.DB_2(queue.id, queue.pId), {
                    estimateNextRepeatAt: 0,
                    estimateNextRetryAt: 0,
                    estimateExecAt: 0,
                    estimateEndAt: recordQueued.estimateEndAt
                  });
                  BATCH_3.expire(this.DB_2(queue.id, queue.pId), this.DEFAULT_EXPIRATION);
                  BATCH_3.select(3);
                  BATCH_3.rpush(this.DB_3(queue.id, queue.pId), JSON.stringify({
                    label: "Exceeded",
                    description: "Execution time has exceeded than the current time",
                    createdAt: Date.now()
                  }));
                  BATCH_3.expire(this.DB_3(queue.id, queue.pId), this.DEFAULT_EXPIRATION);
                }
              }
            }

            if (!queue.currentlyRepeat && !queue.currentlyRetry) {
              const tasks: TasksReq = {
                httpRequest: { ...metadata.httpRequest },
                config: { ...metadata.config }
              };

              if (tasks.config.executionAt === 0 && tasks.config.executionDelay) {
                tasks.config.executionDelay = differenceInMilliseconds(queue.estimateExecAt, Date.now());
              }

              const queued = this.register(tasks, {
                pId: queue.pId,
                id: queue.id
              });
              const recordQueued: RecordQueue = {
                ...queued,
                metadata: this.aes.encrypt(JSON.stringify(tasks))
              };

              BATCH_3.select(1);
              BATCH_3.hset(this.DB_1(queue.id, queue.pId), recordQueued);
              BATCH_3.select(2);
              BATCH_3.hset(this.DB_2(queue.id, queue.pId), { estimateExecAt: queued.estimateExecAt });
              BATCH_3.select(3);
              BATCH_3.rpush(this.DB_3(queue.id, queue.pId), JSON.stringify({
                label: "Alert",
                description: "Server back to online. Re-subscribe task resource",
                createdAt: Date.now()
              }));
            }
          } else {
            // On estimateExecAt is yesterday
            const recordQueued: RecordQueue = {
              ...queue,
              estimateExecAt: 0,
              estimateEndAt: Date.now(),
              state: "EXCEEDED"
            };

            BATCH_3.select(0);
            BATCH_3.hincrby(queue.pId, "taskInQueue", -1);

            BATCH_3.select(1);
            BATCH_3.hset(this.DB_1(queue.id, queue.pId), recordQueued);
            BATCH_3.expire(this.DB_1(queue.id, queue.pId), this.DEFAULT_EXPIRATION);
            BATCH_3.select(2);
            BATCH_3.hset(this.DB_2(queue.id, queue.pId), {
              estimateNextRepeatAt: 0,
              estimateNextRetryAt: 0,
              estimateExecAt: 0,
              estimateEndAt: recordQueued.estimateEndAt
            });
            BATCH_3.expire(this.DB_2(queue.id, queue.pId), this.DEFAULT_EXPIRATION);
            BATCH_3.select(3);
            BATCH_3.rpush(this.DB_3(queue.id, queue.pId), JSON.stringify({
              label: "Exceeded",
              description: "Execution time has exceeded than the current time",
              createdAt: Date.now()
            }));
            BATCH_3.expire(this.DB_3(queue.id, queue.pId), this.DEFAULT_EXPIRATION);
          }
        }
        await BATCH_3.exec();

        keys = null!;
        recordsQueue = null!;
      }
    }
  }
}
