import { ClientIPMiddleware } from "./client-ip.middleware";

describe("ClientIPMiddleware", () => {
  it("should be defined", () => {
    expect(new ClientIPMiddleware()).toBeDefined();
  });
});
