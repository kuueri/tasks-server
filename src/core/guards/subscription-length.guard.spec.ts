import { SubscriptionLengthGuard } from "./subscription-length.guard";

describe("SubscriptionLengthGuard", () => {
  it("should be defined", () => {
    expect(new SubscriptionLengthGuard()).toBeDefined();
  });
});
