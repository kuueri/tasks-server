export type Method = "DELETE" | "PATCH" | "POST" | "PUT";

export type TasksReq = {
  httpRequest: TasksHTTPReq;
  config: TasksConfig;
}

export type TasksHTTPReq = {
  url: string;
  data?: string;
  method: Method;
  params?: {
    [f: string]: string;
  };
  headers?: {
    [f: string]: string;
  };
}

export type TasksConfig = {
  // Scheduling
  executionAt: number; // ms UNIX Epoch
  executionDelay: number; // ms
  // Error config
  retry: number;
  retryAt: number;
  retryInterval: number; // ms
  retryExponential: boolean;
  // Repeat config
  repeat: number;
  repeatAt: number;
  repeatInterval: number; // ms
  repeatExponential: boolean;
  // Timeout
  timeout: number;
}

export type TasksTimeline = {
  label: string;
  description?: string;
  createdAt: number;
  metadata?: {
    [f: string]: string;
  };
}
