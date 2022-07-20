import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    cors: true
  });

  await app.init();

  // @ts-ignore
  app.set("trust proxy", true);

  // At a minimum disable some header
  // @ts-ignore
  app.disable("x-powered-by");

  // Starts the application
  const config = app.get(ConfigService);
  const PORT = +config.get("PORT");

  await app.listen(PORT);
  console.log("Server listening on port " + PORT);
}

bootstrap();
