import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";

import { Agent as HTTPSAgent } from "https";
import { Agent as HTTPAgent } from "http";
import { readFileSync } from "fs";
import { join } from "path";

@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [
        ConfigService
      ],
      useFactory: async (config: ConfigService) => ({
        maxContentLength: config.get("MODULE.HTTP.MAX_CONTENT_LENGTH"),
        maxBodyLength: config.get("MODULE.HTTP.MAX_BODY_LENGTH"),
        headers: {
          "accept": "application/json",
          "content-type": "application/json"
        },
        httpAgent: new HTTPAgent({
          keepAlive: true
        }),
        httpsAgent: new HTTPSAgent({
          cert: readFileSync(join(process.cwd(), "resource/cert/gtsr4.cert.pem")),
          keepAlive: true
        }),
        transitional: {
          clarifyTimeoutError: true
        }
      })
    })
  ],
  exports: [
    HttpModule
  ]
})
export class CoreModule { }
