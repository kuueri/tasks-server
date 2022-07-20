import { Test, TestingModule } from "@nestjs/testing";
import { AESService } from "./aes.service";

describe("AESService", () => {
  let service: AESService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AESService],
    }).compile();

    service = module.get<AESService>(AESService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
