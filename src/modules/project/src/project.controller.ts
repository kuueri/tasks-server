import { Body, Controller, Get, Header, Headers, Post, UseGuards, UseInterceptors, UsePipes, ValidationPipe } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { Observable, take } from "rxjs";

import { ThrottlerBehindProxyGuard } from "src/core/guards/throttler-behind-proxy.guard";
import { SubscriptionGuard } from "src/core/guards/subscription.guard";
import { ProjectGuard } from "src/core/guards/project.guard";

import { ASCInterceptor } from "src/core/interceptors/asc.interceptor";

import { ParseEmailPipe } from "src/core/pipes/parse-email.pipe";

import { ProjectService } from "./project.service";

import { SafeAny } from "src/core/types/empty";

@Controller("/v1beta")
export class ProjectController {

  constructor(
    private readonly project: ProjectService
  ) { }

  @Get("/info")
  @Header("access-control-allow-methods", "GET")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseGuards(SubscriptionGuard, ThrottlerBehindProxyGuard)
  @UseInterceptors(ASCInterceptor)
  public info(@Headers("x-kuueri-tasks-project") pId: string): Observable<{ [f: string]: SafeAny }> {
    return this.project.info(pId).pipe(
      take(1)
    );
  }

  @Post("/register")
  @Header("access-control-allow-methods", "POST")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @Throttle({
    default: {
      ttl: 86400,
      limit: 128
    }
  })
  @UseGuards(ProjectGuard, ThrottlerBehindProxyGuard)
  public register(@Body("email", ParseEmailPipe) email: string ): Observable<{ [f: string]: string }> {
    return this.project.register({ email }).pipe(
      take(1)
    );
  }
}
