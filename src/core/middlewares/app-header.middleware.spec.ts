import { AppHeaderMiddleware } from "./app-header.middleware";

describe("AppHeaderMiddleware", () => {
  it("should be defined", () => {
    expect(new AppHeaderMiddleware()).toBeDefined();
  });
});
