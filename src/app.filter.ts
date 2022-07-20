import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";

import { isArray, toSafeInteger, toString } from "lodash";
import { Response } from "express";

import { SafeUnknown } from "./core/types/empty";

@Catch()
export class AppFilter implements ExceptionFilter {

  private readonly logger = new Logger();

  public catch(exception: SafeUnknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    // Define status code from Nest HTTP exception
    const statusCode = exception instanceof HttpException
      ? exception.getStatus()
      // @ts-ignore
      : exception?.code === "EBADCSRFTOKEN"
        ? HttpStatus.FORBIDDEN
        : HttpStatus.INTERNAL_SERVER_ERROR;
    // Error important for HTTP request
    // @ts-ignore
    if ("isAxiosError" in exception) {
      // @ts-ignore
      const statusCode = toSafeInteger(exception?.response?.status) || HttpStatus.INTERNAL_SERVER_ERROR;
      this.setResponse(res, statusCode, {
        response: {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: "Internal Server Error"
        }
      });
    } else {
      // Error app
      try {
        // @ts-ignore
        if ("statusCode" in exception?.response) {
          this.logger.error(toString(exception));
        }
        // @ts-ignore
        if ("0" in exception?.response) {
          // @ts-ignore
          const requestAlert = toString(exception.response["0"].message);
          this.logger.error(toString(exception + " " + requestAlert));
        }
      } catch (error) {
        this.logger.error(toString(exception));
      }
      // Check http status code
      // @ts-ignore
      if (isArray(exception?.response?.message)) {
        // @ts-ignore
        this.setResponse(res, statusCode, {
          response: {
            // @ts-ignore
            ...exception.response.message
          }
        });
      } else {
        // @ts-ignore
        console.error(exception.response);
        this.setResponse(res, statusCode, exception);
      }
    }
  }

  private setResponse(res: Response, code: number, ex?: unknown): void {
    switch(code) {
      case HttpStatus.BAD_REQUEST:
        res.status(code).json({
          actionMessage: "Do not retry without fixing the problem",
          description: "A request includes an invalid credential or value",
          // @ts-ignore
          throw: ex.response
        });
        break;
      case HttpStatus.UNAUTHORIZED:
        res.status(code).json({
          actionMessage: "Do not retry without fixing the problem",
          description: "The request did not include valid authorization",
          // @ts-ignore
          throw: ex.response
        });
        break;
      case HttpStatus.CONFLICT:
        res.status(code).json({
          actionMessage: "Do not retry without fixing the problem",
          description: "A request includes an pre-existing value",
          // @ts-ignore
          throw: ex.response
        });
        break;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        res.status(code).json({
          actionMessage: "Do not retry this request more than once",
          description: "The request is larger than the server specified",
          // @ts-ignore
          throw: ex.response
        });
        break;
      case HttpStatus.TOO_MANY_REQUESTS:
        res.status(code).json({
          actionMessage: "Please wait until the server restore your connection",
          description: "Too many requests in a given amount of time",
          // @ts-ignore
          throw: ex.response
        });
        break;
      case HttpStatus.INTERNAL_SERVER_ERROR:
        res.status(code).json({
          actionMessage: "Do not retry this request more than once",
          description: "The server returned an error",
          // @ts-ignore
          throw: ex.response
        });
        break;
      case HttpStatus.SERVICE_UNAVAILABLE:
        res.status(code).json({
          actionMessage: "Do not retry this request more than once",
          description: "The server is currently unable to handle the request",
          // @ts-ignore
          throw: ex.response
        });
        break;
      default:
        res.status(code).end();
        break;
    }
  }
}
