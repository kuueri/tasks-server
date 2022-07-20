import { Injectable } from '@nestjs/common';

import { isEmpty, toSafeInteger, toUpper, zipObject } from "lodash";

import { SafeAny } from "../types/empty";

@Injectable()
export class UtilService {

  public toStatusCode(error: SafeAny): number {
    return !!toSafeInteger(error?.response?.status)
      ? toSafeInteger(error?.response?.status)
      : error?.code === "ETIMEDOUT"
        ? 429
        : 500;
  }

  public sortFields<T>(object: T): T {
    return Object.keys(object).sort().reduce((acc, key) => {
      return {
        ...acc,
        // @ts-ignore
        [key]: object[key]
      };
    }, {}) as T;
  }

  public toTypes<T>(field: T): T {
    if (isEmpty(field)) {
      return field;
    }
    const keys = Object.keys(field);
    const values = Object.values(field) as Array<string>;
    const typesValue = values.map(v => {
      // On empty
      if (toUpper(v) === "UNDEFINED" || toUpper(v) === "NULL" || v === "") {
        return null;
      }
      // Boolean
      if (toUpper(v) === "FALSE") {
        return false;
      }
      if (toUpper(v) === "TRUE") {
        return true;
      }
      // Number
      if (/^\d+$/.test(v)) {
        return +v;
      }
      return v;
    });
    return zipObject(keys, typesValue) as unknown as T;
  }
}
