import { Body, Controller, Delete, Get, Header, Headers, Param, Patch, Post, Query, UseGuards, UseInterceptors, UsePipes, ValidationPipe } from "@nestjs/common";

import { first, Observable } from "rxjs";

import { SubscriptionService } from "./subscription.service";

import { SubscriptionSchema } from "./subscription-schema";

import { SubscriptionPipe } from "./subscription.pipe";

import { TasksDTO } from "./subscription-dto";

import { ThrottlerBehindProxyGuard } from "src/core/guards/throttler-behind-proxy.guard";
import { SubscriptionLengthGuard } from "src/core/guards/subscription-length.guard";
import { SubscriptionGuard } from "src/core/guards/subscription.guard";

import { ASCInterceptor } from "src/core/interceptors/asc.interceptor";

import { Dequeue, Queued } from "src/core/types/queue";
import { TasksTimeline } from "src/core/types/tasks";
import { SafeAny } from "src/core/types/empty";

const schema = new SubscriptionSchema();

@Controller("/v1beta")
export class SubscriptionController {

  constructor(
    private readonly subscription: SubscriptionService
  ) { }

  @Get("/queues/:id")
  @Header("access-control-allow-methods", "GET, DELETE")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseGuards(SubscriptionGuard, ThrottlerBehindProxyGuard)
  @UseInterceptors(ASCInterceptor)
  public value(
    @Param("id") id: string,
    @Headers("x-kuueri-tasks-project") pId: string
  ): Observable<Record<string, SafeAny>> {
    return this.subscription.valueChanges(id, pId).pipe(
      first()
    );
  }

  @Get("/queues/:id/timeline")
  @Header("access-control-allow-methods", "GET")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseGuards(SubscriptionGuard, ThrottlerBehindProxyGuard)
  public timeline(
    @Param("id") id: string,
    @Headers("x-kuueri-tasks-project") pId: string
  ): Observable<Array<TasksTimeline>> {
    return this.subscription.timelineChanges(id, pId).pipe(
      first()
    );
  }

  @Post("/subscribe")
  @Header("access-control-allow-methods", "POST")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
  @UseGuards(SubscriptionGuard, SubscriptionLengthGuard)
  @UseInterceptors(ASCInterceptor)
  public subscribe(
    @Body(new SubscriptionPipe(schema.register())) body: TasksDTO,
    @Headers("x-kuueri-tasks-project") pId: string
  ): Observable<Queued> {
    return this.subscription.subscribe(body, pId).pipe(
      first()
    );
  }

  @Patch("/pause/:id")
  @Header("access-control-allow-methods", "PATCH")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseGuards(SubscriptionGuard)
  @UseInterceptors(ASCInterceptor)
  public pause(
    @Param("id") id: string,
    @Headers("x-kuueri-tasks-project") pId: string
  ): Observable<{ [f: string]: string }> {
    return this.subscription.pause(id, pId).pipe(
      first()
    );
  }

  @Patch("/resume/:id")
  @Header("access-control-allow-methods", "PATCH")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseGuards(SubscriptionGuard, SubscriptionLengthGuard)
  @UseInterceptors(ASCInterceptor)
  public resume(
    @Param("id") id: string,
    @Headers("x-kuueri-tasks-project") pId: string
  ): Observable<Queued> {
    return this.subscription.resume(id, pId).pipe(
      first()
    );
  }

  @Patch("/unsubscribe/:id")
  @Header("access-control-allow-methods", "PATCH")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseGuards(SubscriptionGuard)
  public unsubscribe(
    @Param("id") id: string,
    @Query("args") d: string,
    @Headers("x-kuueri-tasks-project") pId: string
  ): Observable<Dequeue> {
    return this.subscription.unsubscribe(id, pId, d).pipe(
      first()
    );
  }

  @Delete("/queues/:id")
  @Header("access-control-allow-methods", "GET, DELETE")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseGuards(SubscriptionGuard)
  public purge(
    @Param("id") id: string,
    @Headers("x-kuueri-tasks-project") pId: string
  ): Observable<{ [f: string]: string }> {
    return this.subscription.purge(id, pId).pipe(
      first()
    );
  }
}
