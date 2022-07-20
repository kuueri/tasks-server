import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { ProjectController } from './src/project.controller';

import { ProjectService } from './src/project.service';
import { UtilService } from "src/core/services/util.service";

import { NoCacheMiddleware } from "src/core/middlewares/nocache.middleware";

@Module({
  controllers: [
    ProjectController
  ],
  providers: [
    ProjectService,
    UtilService
  ]
})
export class ProjectModule implements NestModule {

  /**
   * @event
   * @private
  */
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(NoCacheMiddleware).forRoutes(ProjectController);
  }
}
