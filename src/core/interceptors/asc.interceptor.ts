import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";

import { map, Observable } from "rxjs";

import { SafeAny } from "../types/empty";

@Injectable()
export class ASCInterceptor implements NestInterceptor {

  public intercept(_: ExecutionContext, next: CallHandler): Observable<SafeAny> {
    return next.handle().pipe(
      // Apply projection with each value from source
      map(obj => {
        return Object.keys(obj).sort().reduce((acc, key) => {
          return {
            ...acc,
            // @ts-ignore
            [key]: obj[key]
          };
        }, {});
      })
    );
  }
}
