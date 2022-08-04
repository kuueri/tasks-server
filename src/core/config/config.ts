import { Logger } from "@nestjs/common";

import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { readFileSync } from "fs";
import { toString } from "lodash";
import { join } from "path";

export default async () => {
  const logger = new Logger();

  try {
    const buffer = readFileSync(join(process.cwd(), "resource/config/config.json"));
    const data = buffer.toString();

    logger.log("Configuration loaded from local");

    return Promise.resolve(JSON.parse(data));
  } catch (e) {
    try {
      // Construct an instance of SecretManagerServiceClient
      const client = new SecretManagerServiceClient({
        keyFilename: process.env.TASKS_KEY_FILENAME
      });

      // Access the secret
      const [version] = await client.accessSecretVersion({
        name: process.env.TASKS_VERSION
      });

      // Returns a string representation of a string
      // WARNING: Do not print the secret in a production level
      const data = version.payload?.data?.toString();
      if (data) {
        logger.log("Configuration loaded from Secret Manager");

        return JSON.parse(data);
      }

      return {};
    } catch (ee) {
      logger.warn(toString(ee));

      return {};
    }
  }
}
