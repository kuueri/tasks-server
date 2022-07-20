import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

import { trim } from "lodash";

import Joi from "joi";

@Injectable()
export class ParseEmailPipe implements PipeTransform {

  public transform(value: string, metadata: ArgumentMetadata): string {
    const schema = Joi.string().email().required();
    const { error } = schema.validate(trim(value), {
      abortEarly: false,
      dateFormat: "utc",
      convert: false
    });
    if (error) {
      throw new BadRequestException();
    }
    return value;
  }
}
