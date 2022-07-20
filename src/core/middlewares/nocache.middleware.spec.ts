import { NoCacheMiddleware } from "./nocache.middleware";

describe("NoCacheMiddleware", () => {
  it("should be defined", () => {
    expect(new NoCacheMiddleware()).toBeDefined();
  });
});
