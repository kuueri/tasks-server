import { defaults, isEmpty, isObjectLike, isString, trim } from "lodash";
import { Expose, Transform, Type } from "class-transformer";
import { Allow, ValidateNested } from "class-validator";

import { Method, TasksConfig, TasksHTTPReq, TasksReq } from "src/core/types/tasks";

import ms from "ms";

class HttpRequest implements TasksHTTPReq {

  @Allow()
  @Expose({ toClassOnly: true })
  public url!: string;

  @Allow()
  public data?: string;

  @Allow()
  @Expose({ toClassOnly: true })
  public method!: Method;

  @Allow()
  @Transform(({ value }) => isObjectLike(value) ? defaults(value) : value, { toClassOnly: true })
  public params?: { [f: string]: string };

  @Allow()
  @Transform(({ value }) => isObjectLike(value) ? defaults(value) : value, { toClassOnly: true })
  public headers?: { [f: string]: string };
}

class Config implements TasksConfig {

  /**
   * @default 0
  */
  @Allow()
  public retry!: number;

  /**
   * @default 0
  */
  @Allow()
  public repeat!: number;

  /**
   * Execution Time
   *
   * @default EMPTY
   * @variation milliseconds
  */
  @Allow()
  public executionAt!: number;

  @Allow()
  public retryAt!: number;

  @Allow()
  public repeatAt!: number;

  /**
   * @default 1000
   * @variation milliseconds
  */
  @Allow()
  @Transform(({ value }) => {
    if (isString(value)) {
      const state = trim(value).toLowerCase();
      if (isEmpty(state)) {
        return value;
      }
      try {
        return ms(state);
      } catch (error) {
        return null;
      }
    }
    return value;
  }, { toClassOnly: true })
  public retryInterval!: number;

  /**
   * @default 1000
   * @variation milliseconds
  */
  @Allow()
  @Transform(({ value }) => {
    if (isString(value)) {
      const state = trim(value).toLowerCase();
      if (isEmpty(state)) {
        return value;
      }
      try {
        return ms(state);
      } catch (error) {
        return null;
      }
    }
    return value;
  }, { toClassOnly: true })
  public repeatInterval!: number;

  /**
   * @default true
  */
  @Allow()
  public retryExponential!: boolean;

  /**
   * @default true
  */
  @Allow()
  public repeatExponential!: boolean;

  /**
   * @default 0
   * @variation milliseconds
  */
  @Allow()
  @Transform(({ value }) => {
    if (isString(value)) {
      const state = trim(value).toLowerCase();
      if (isEmpty(state)) {
        return value;
      }
      try {
        return ms(state);
      } catch (error) {
        return null;
      }
    }
    return value;
  }, { toClassOnly: true })
  public executionDelay!: number;

  /**
   * @default 0
   * @variation milliseconds
  */
  @Allow()
  @Transform(({ value }) => {
    if (isString(value)) {
      const state = trim(value).toLowerCase();
      if (isEmpty(state)) {
        return value;
      }
      try {
        return ms(state);
      } catch (error) {
        return null;
      }
    }
    return value;
  }, { toClassOnly: true })
  public timeout!: number;
}

export class TasksDTO implements TasksReq {

  @Type(() => HttpRequest)
  @ValidateNested({ each: true })
  public httpRequest!: HttpRequest;

  @Type(() => Config)
  @ValidateNested({ each: true })
  public config!: Config;
}
