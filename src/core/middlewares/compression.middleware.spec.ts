import { CompressionMiddleware } from "./compression.middleware";

describe("CompressionMiddleware", () => {
  it("should be defined", () => {
    expect(new CompressionMiddleware()).toBeDefined();
  });
});
