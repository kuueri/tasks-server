import { TasksDTO } from "./subscription-dto";

describe("SubscriptionDTO", () => {
  it("should be defined", () => {
    expect(new TasksDTO()).toBeDefined();
  });
});
