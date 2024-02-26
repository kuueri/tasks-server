import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_FILTER } from "@nestjs/core";

import { RedisModule } from "@liaoliaots/nestjs-redis";

import { CoreModule } from "./core/core.module";

import { SubscriptionModule } from "./modules/subscription/subscription.module";
import { ProjectModule } from './modules/project/project.module';

import { CompressionMiddleware } from "./core/middlewares/compression.middleware";
import { UserAgentMiddleware } from "./core/middlewares/user-agent.middleware";
import { AppHeaderMiddleware } from "./core/middlewares/app-header.middleware";
import { ClientIPMiddleware } from "./core/middlewares/client-ip.middleware";

import { AppFilter } from "./app.filter";

import config from "./core/config/config";

@Module({
  providers: [
    { provide: APP_FILTER, useClass: AppFilter }
  ],
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: true,
      isGlobal: true,
      cache: true,
      load: [
        config
      ]
    }),
    RedisModule.forRootAsync({
      inject: [
        ConfigService
      ],
      useFactory: async (config: ConfigService) => ({
        readyLog: true,
        config: {
          host: config.get("DATABASE.REDIS.HOST"),
          port: config.get("DATABASE.REDIS.PORT"),
          username: config.get("DATABASE.REDIS.USERNAME"),
          password: config.get("DATABASE.REDIS.PASSWORD"),
          connectTimeout: 30000
        },
      })
    }),
    ThrottlerModule.forRootAsync({
      imports: [
        ConfigModule
      ],
      inject: [
        ConfigService
      ],
      // @ts-ignore
      useFactory: (config: ConfigService) => [
        {
          limit: config.get<number>("MODULE.THROTTLER.LIMIT"),
          ttl: config.get<number>("MODULE.THROTTLER.TTL")
        }
      ]
    }),
    CoreModule,
    ProjectModule,
    SubscriptionModule
  ]
})
export class AppModule implements NestModule {

  /**
   * @event
   * @private
  */
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AppHeaderMiddleware, UserAgentMiddleware, ClientIPMiddleware, CompressionMiddleware)
      .forRoutes("*");
  }
}
