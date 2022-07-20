import { UserAgentMiddleware } from "./user-agent.middleware";

describe("UserAgentMiddleware", () => {
  it("should be defined", () => {
    expect(new UserAgentMiddleware()).toBeDefined();
  });
});
