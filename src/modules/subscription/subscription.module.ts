import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";

import { SubscriptionService } from "./src/subscription.service";
import { UtilService } from "src/core/services/util.service";
import { AESService } from "src/core/services/aes.service";

import { SubscriptionController } from "./src/subscription.controller";

import { DefaultHeaderMiddleware } from "src/core/middlewares/default-header.middleware";
import { NoCacheMiddleware } from "src/core/middlewares/nocache.middleware";

@Module({
  controllers: [
    SubscriptionController
  ],
  providers: [
    SubscriptionService,
    UtilService,
    AESService
  ]
})
export class SubscriptionModule implements NestModule {

  /**
   * @event
   * @private
  */
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(DefaultHeaderMiddleware, NoCacheMiddleware)
      .forRoutes(SubscriptionController);
  }
}
