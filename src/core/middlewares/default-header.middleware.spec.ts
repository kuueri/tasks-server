import { DefaultHeaderMiddleware } from "./default-header.middleware";

describe("DefaultHeaderMiddleware", () => {
  it("should be defined", () => {
    expect(new DefaultHeaderMiddleware()).toBeDefined();
  });
});
