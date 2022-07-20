import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AES, enc } from "crypto-js";

@Injectable()
export class AESService {

  constructor(
    private readonly config: ConfigService
  ) { }

  public encrypt(text: string): string {
    return AES.encrypt(text, this.key).toString();
  }

  public encryptAsync(text: string): Promise<string> {
    return Promise.resolve(AES.encrypt(text, this.key).toString());
  }

  public decrypt(encryptedText: string): string {
    return AES.decrypt(encryptedText, this.key).toString(enc.Utf8);
  }

  public decryptAsync(encryptedText: string): Promise<string> {
    return Promise.resolve(AES.decrypt(encryptedText, this.key).toString(enc.Utf8));
  }

  private get key(): string {
    return this.config.get("SERVICE.CRYPTO.KEY") as string;
  }
}
