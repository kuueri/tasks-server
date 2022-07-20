import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

import { ObjectSchema } from "joi";
import { toString } from "lodash";

import { TasksReq } from "src/core/types/tasks";

@Injectable()
export class SubscriptionPipe implements PipeTransform {

  constructor(
    private readonly schema: ObjectSchema<TasksReq>
  ) { }

  public transform(value: TasksReq, metadata: ArgumentMetadata): TasksReq {
    const { error } = this.schema.validate(value, {
      abortEarly: false,
      dateFormat: "utc",
      convert: false
    });
    if (error) {
      const details = error.details
        .map(detail => ({ [toString(detail.path)
        .replace(/\,/g, ".")]: detail.message }));
      throw new BadRequestException({ details });
    }
    return value;
  }
}
