import { addMilliseconds, isAfter } from "date-fns";
import { isHttpUri, isHttpsUri } from "valid-url";
import { isEmpty, trim } from "lodash";
import { parse } from "urijs";

import { TasksConfig, TasksHTTPReq, TasksReq } from "src/core/types/tasks";

import Joi from "joi";

export class SubscriptionSchema {

  public register(): Joi.ObjectSchema<TasksReq> {
    return Joi.object()
      .keys({
        // HTTP request
        httpRequest: Joi.object<TasksHTTPReq>()
          .label("Payload HTTP request")
          .messages({
            "any.invalid": "Must be of type object",
            "any.required": "Payload HTTP request is required",
            "object.base": "Must be of type object"
          })
          .keys({
            url: Joi.string()
              .label("HTTP request URL")
              .messages({
                "any.invalid": "Must be a valid URL and is not allowed to localhost",
                "any.required": "HTTP request URL is required",
                "string.base": "Must be a valid URL and is not allowed to localhost",
                "string.uri": "Must be a valid URL and is not allowed to localhost",
                "string.min": "Length must be at least {{#limit}} characters long",
                "string.max": "Length must be less than or equal to {{#limit}} characters long",
                "string.empty": "Is not allowed to be empty",
                "string.uriCustomScheme": "Must be a valid URL with a scheme matching the http:// or https:// pattern",
              })
              .uri({ scheme: /https?/ })
              .custom((value: string, helpers) => {
                if (isHttpUri(value) || isHttpsUri(value)) {
                  const hostname = parse(value).hostname?.toLowerCase();
                  if (hostname === "localhost") {
                    return helpers.error("string.uri");
                  }
                  return value;
                }
                return helpers.error("string.uri");
              })
              .required(),
            data: Joi.string()
              .label("HTTP request data")
              .messages({
                "any.invalid": "Must be a valid base64 string",
                "string.base": "Must be a valid base64 string",
                "string.empty": "Is not allowed to be empty",
                "string.base64": "Must be a valid base64 string"
              })
              .base64({ paddingRequired: false })
              .custom((value, helpers) => {
                if (isEmpty(trim(value))) {
                  return helpers.error("string.base");
                }
                return value;
              })
              .optional(),
            method: Joi.string()
              .label("HTTP request method")
              .messages({
                "any.only": "Must be one of POST, PATCH, PUT or DELETE",
                "any.invalid": "Must be one of POST, PATCH, PUT or DELETE",
                "any.required": "HTTP request method is required",
                "string.base": "Must be one of POST, PATCH, PUT or DELETE",
                "string.empty": "Is not allowed to be empty",
                "string.uppercase": "Must only contain uppercase characters"
              })
              .uppercase()
              .valid("DELETE", "PATCH", "POST", "PUT")
              .required(),
            params: Joi.object()
              .label("HTTP query params")
              .messages({
                "any.only": "Must be a valid object key-value",
                "any.invalid": "Must be a valid object key-value",
                "any.unknown": "Must be a valid object key-value"
              })
              .invalid({})
              .pattern(
                Joi.string()
                  .label("Key")
                  .messages({
                    "any.invalid": "Must be a valid string",
                    "string.base": "Must be a valid string",
                    "string.min": "Length must be at least {{#limit}} characters long",
                    "string.max": "Length must be less than or equal to {{#limit}} characters long",
                    "string.empty": "Is not allowed to be empty"
                  })
                  .alphanum()
                  .min(1)
                  .max(64),
                Joi.string()
                  .label("Value")
                  .messages({
                    "any.invalid": "Must be a valid string",
                    "string.base": "Must be a valid string",
                    "string.max": "Length must be less than or equal to {{#limit}} characters long"
                  })
                  .allow("")
                  .max(1024)
              )
              .optional(),
            headers: Joi.object()
              .label("HTTP headers")
              .messages({
                "any.only": "Must be a valid object key-value",
                "any.invalid": "Must be a valid object key-value",
                "any.unknown": "Must be a valid object key-value"
              })
              .invalid({})
              .pattern(
                Joi.string()
                  .label("Key")
                  .messages({
                    "any.invalid": "Must be a valid string",
                    "string.base": "Must be a valid string",
                    "string.min": "Length must be at least {{#limit}} characters long",
                    "string.max": "Length must be less than or equal to {{#limit}} characters long",
                    "string.empty": "Is not allowed to be empty"
                  })
                  .regex(/^[a-zA-Z0-9\-]+$/)
                  .min(1)
                  .max(64),
                Joi.string()
                  .label("Value")
                  .messages({
                    "any.invalid": "Must be a valid string",
                    "string.base": "Must be a valid string",
                    "string.max": "Length must be less than or equal to {{#limit}} characters long"
                  })
                  .allow("")
                  .max(1024)
              )
              .optional()
          })
          .required(),
        // Task config
        config: Joi.object<TasksConfig>()
          .label("HTTP request configuration")
          .keys({
            executionAt: Joi.number()
              .label("Execution time")
              .messages({
                "any.invalid": "Must be a valid millisecond. Visit millisecond since Unix Epoch https://currentmillis.com",
                "number.base": "Must be a valid millisecond. Visit millisecond since Unix Epoch https://currentmillis.com",
                "number.integer": "Must be a valid millisecond. Visit millisecond since Unix Epoch https://currentmillis.com",
              })
              .integer()
              .default(0)
              .optional(),
            executionDelay: Joi.number()
              .label("Execution delay")
              .messages({
                "any.invalid": "Must be a valid millisecond or use millisecond conversion utility. Visit https://docs.tasks.kuueriprojects.com/reference/v1beta/manage-execution/terms#format-milliseconds",
                "number.base": "Must be a valid millisecond or use millisecond conversion utility. Visit https://docs.tasks.kuueriprojects.com/reference/v1beta/manage-execution/terms#format-milliseconds",
                "number.min": "Must be greater than or equal to {{#limit}}",
                "number.integer": "Must be a valid millisecond or use millisecond conversion utility. Visit https://docs.tasks.kuueriprojects.com/reference/v1beta/manage-execution/terms#format-milliseconds"
              })
              .default(1)
              .integer()
              .min(1)
              .optional(),
            timeout: Joi.number()
              .label("Timeout")
              .messages({
                "any.invalid": "Must be a valid millisecond or millisecond conversion utility. Visit https://docs.tasks.kuueriprojects.com/reference/v1beta/manage-execution/terms#format-milliseconds",
                "number.base": "Must be a valid millisecond or millisecond conversion utility. Visit https://docs.tasks.kuueriprojects.com/reference/v1beta/manage-execution/terms#format-milliseconds",
                "number.min": "Must be greater than or equal to {{#limit}}",
                "number.max": "Must be less than or equal to {{#limit}}",
                "number.integer": "Must be a valid millisecond or millisecond conversion utility. Visit https://docs.tasks.kuueriprojects.com/reference/v1beta/manage-execution/terms#format-milliseconds"
              })
              .default(300000)
              .integer()
              .min(1)
              .max(600000)
              .optional(),
            retry: Joi.number()
              .label("Retry")
              .messages({
                "any.invalid": "Must be a valid UInt16 struct",
                "number.base": "Must be a valid UInt16 struct",
                "number.min": "Must be greater than or equal to {{#limit}}",
                "number.max": "Must be less than or equal to {{#limit}}",
                "number.integer": "Must be a valid UInt16 struct"
              })
              .default(0)
              .integer()
              .min(0)
              .max(4294967295)
              .optional(),
            repeat: Joi.number()
              .label("Repeat")
              .messages({
                "any.invalid": "Must be a valid UInt16 struct",
                "number.base": "Must be a valid UInt16 struct",
                "number.min": "Must be greater than or equal to {{#limit}}",
                "number.max": "Must be less than or equal to {{#limit}}",
                "number.integer": "Must be a valid UInt16 struct"
              })
              .default(0)
              .integer()
              .min(0)
              .max(16)
              .optional(),
            retryAt: Joi.number()
              .integer()
              .optional(),
            repeatAt: Joi.number()
              .integer()
              .optional(),
            retryInterval: Joi.number()
              .label("Retry interval")
              .messages({
                "any.invalid": "Must be a valid millisecond or use millisecond conversion utility. Visit https://docs.tasks.kuueriprojects.com/reference/v1beta/manage-execution/terms#format-milliseconds",
                "number.base": "Must be a valid millisecond or use millisecond conversion utility. Visit https://docs.tasks.kuueriprojects.com/reference/v1beta/manage-execution/terms#format-milliseconds",
                "number.min": "Must be greater than or equal to {{#limit}}",
                "number.integer": "Must be a valid millisecond or use millisecond conversion utility. Visit https://docs.tasks.kuueriprojects.com/reference/v1beta/manage-execution/terms#format-milliseconds"
              })
              .default(1000)
              .integer()
              .min(1000)
              .optional(),
            repeatInterval: Joi.number()
              .label("Repeat interval")
              .messages({
                "any.invalid": "Must be a valid millisecond or use millisecond conversion utility. Visit https://docs.tasks.kuueriprojects.com/reference/v1beta/manage-execution/terms#format-milliseconds",
                "number.base": "Must be a valid millisecond or use millisecond conversion utility. Visit https://docs.tasks.kuueriprojects.com/reference/v1beta/manage-execution/terms#format-milliseconds",
                "number.min": "Must be greater than or equal to {{#limit}}",
                "number.integer": "Must be a valid millisecond or use millisecond conversion utility. Visit https://docs.tasks.kuueriprojects.com/reference/v1beta/manage-execution/terms#format-milliseconds"
              })
              .default(1000)
              .integer()
              .min(1000)
              .optional(),
            retryExponential: Joi.boolean()
              .label("Use retry exponential")
              .messages({
                "any.invalid": "Must be a boolean",
                "boolean.base": "Must be a boolean"
              })
              .default(true)
              .optional(),
            repeatExponential: Joi.boolean()
              .label("Use repeat exponential")
              .messages({
                "any.invalid": "Must be a boolean",
                "boolean.base": "Must be a boolean"
              })
              .default(true)
              .optional()
          })
          .custom((value, helpers) => {
            const today = Date.now();
            if (value?.executionDelay) {
              const execAt = addMilliseconds(today, value.executionDelay).getTime();
              if (value?.repeatAt) {
                if (isAfter(value.repeatAt, execAt)) {
                  return value;
                }
                // @ts-ignore
                // Assign new value the current validation state
                helpers.state.path = ["config.repeatAt"];
                // Generate error codes using a message code
                const errors = helpers.error("any.invalid") as Joi.ErrorReport;
                errors.message = "Must be greater than estimate execution at " + execAt;
                return errors;
              }

              if (value?.retryAt) {
                if (isAfter(value.retryAt, execAt)) {
                  return value;
                }
                // @ts-ignore
                // Assign new value the current validation state
                helpers.state.path = ["config.retryAt"];
                // Generate error codes using a message code
                const errors = helpers.error("any.invalid") as Joi.ErrorReport;
                errors.message = "Must be greater than estimate execution at " + execAt;
                return errors;
              }
            }

            if (value?.executionAt) {
              if (value?.repeatAt) {
                if (isAfter(value.repeatAt, value.executionAt)) {
                  return value;
                }
                // @ts-ignore
                // Assign new value the current validation state
                helpers.state.path = ["config.repeatAt"];
                // Generate error codes using a message code
                const errors = helpers.error("any.invalid") as Joi.ErrorReport;
                errors.message = "Must be greater than estimate execution at " + value.executionAt;
                return errors;
              }

              if (value?.retryAt) {
                if (isAfter(value.retryAt, value.executionAt)) {
                  return value;
                }
                // @ts-ignore
                // Assign new value the current validation state
                helpers.state.path = ["config.retryAt"];
                // Generate error codes using a message code
                const errors = helpers.error("any.invalid") as Joi.ErrorReport;
                errors.message = "Must be greater than estimate execution at " + value.executionAt;
                return errors;
              }

              if (isAfter(value.executionAt, today)) {
                return value;
              }
              // @ts-ignore
              // Assign new value the current validation state
              helpers.state.path = ["config.executionAt"];
              // Generate error codes using a message code
              const errors = helpers.error("any.invalid") as Joi.ErrorReport;
              errors.message = "Must be greater than today at " + today;
              return errors;
            }

            return value;
          })
          .optional()
      })
      .required();
  }
}
