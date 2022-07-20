import { ThrottlerBehindProxyGuard } from "./throttler-behind-proxy.guard";

describe("ThrottlerBehindProxyGuard", () => {
  it("should be defined", () => {
    expect(new ThrottlerBehindProxyGuard()).toBeDefined();
  });
});
