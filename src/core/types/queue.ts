import { Subscription } from "rxjs";

import { TasksConfig } from "./tasks";

export type StateEnd = "UNSUBSCRIBED" | "UNSUBSCRIBED & EMPTY";
export type StateQueue = "RUNNING" | "CANCELED" | "COMPLETED" | "EXCEEDED" | "PAUSED" | "ERROR";

export type StackQueued = {
  id: string;
  pId: string;
  state: StateQueue;
  statusCode: number;
  /**
   * endAt
   *
   * Date when the task was `CANCELED`, `COMPLETED`, or `ERROR`
  */
  estimateEndAt: number;
  /**
   * execAt
   *
   * Date when the task start execution
  */
  estimateExecAt: number;
  /**
   * startAt
   *
   * Date when the task was registered
  */
  estimateStartAt: number;
  // Returns an tasks that mirrors the source Observable with the exception of an error or complete
  currentlyRetry: boolean;
  currentlyRepeat: boolean;
  /**
   * Subscription
   *
   * Disposable resource that usually represents the execution of an Observable
   *
   * @see https://rxjs.dev/guide/subscription
  */
  subscription: Subscription;
  config: TasksConfig;
};

export type Queued = {
  // Metadata
  id: string;
  pId: string;
  state: StateQueue;
  statusCode: number;
  /**
   * endAt
   *
   * Date when the task was `CANCELED`, `COMPLETED`, or `ERROR`
  */
  estimateEndAt: number;
  /**
   * execAt
   *
   * Date when the task start execution
  */
  estimateExecAt: number;
  /**
   * startAt
   *
   * Date when the task was registered
  */
  estimateStartAt: number;
  // Returns an tasks that mirrors the source Observable with the exception of an error or complete
  currentlyRetry: boolean;
  currentlyRepeat: boolean;
}

export type Dequeue = {
  [f: string]: StateEnd;
};

export type RegisterOption = {
  isRepeatTerminated?: boolean;
  isRetryTerminated?: boolean;
  currentlyRepeat?: boolean;
  currentlyRetry?: boolean;
  statusCode?: number;
  isPaused?: boolean;
  pId: string;
  id?: string;
};

export type RecordQueueConf = {
  // Retrying
  retryCount: number;
  retryLimit: number;
  finalizeRetry: number;
  isRetryTerminated: boolean;
  estimateNextRetryAt: number;
  // Repeating
  repeatCount: number;
  repeatLimit: number;
  finalizeRepeat: number;
  isRepeatTerminated: boolean;
  estimateNextRepeatAt: number;
  // Adt
  executionAt: number;
  executionDelay: number;
  estimateEndAt: number;
  estimateExecAt: number;
};

export interface RecordQueue extends Queued {
  /**
   * Metadata contains initial tasks request
  */
  metadata: string;
};
