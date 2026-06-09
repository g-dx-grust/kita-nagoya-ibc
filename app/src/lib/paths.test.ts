import { afterEach, describe, expect, it, vi } from "vitest";

async function loadPathsWithEnv(basePath: string, apiBasePath: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_KITAGOYA_BASE_PATH", basePath);
  vi.stubEnv("NEXT_PUBLIC_KITAGOYA_API_BASE_PATH", apiBasePath);

  return import("./paths");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("kitagoya paths", () => {
  it("strips wrapping quotes from Vercel environment variable values", async () => {
    const { kitagoyaPath, kitagoyaApiPath } = await loadPathsWithEnv(
      `"/manufacturing/kitanagoya"`,
      `"/api/kitanagoya"`,
    );

    expect(kitagoyaPath("/production-plans")).toBe(
      "/manufacturing/kitanagoya/production-plans",
    );
    expect(kitagoyaApiPath("/api/products")).toBe("/api/kitanagoya/products");
  });
});
