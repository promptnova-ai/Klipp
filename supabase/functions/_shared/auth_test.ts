import { parseBearerToken } from "./auth.ts";

Deno.test("parses a standard bearer token", () => {
  if (parseBearerToken("Bearer qa-token") !== "qa-token") {
    throw new Error("Expected the bearer token to be extracted");
  }
});

Deno.test("parses bearer scheme case-insensitively", () => {
  if (parseBearerToken("bEaReR qa-token") !== "qa-token") {
    throw new Error("Expected mixed-case Bearer to be accepted");
  }
});

Deno.test("rejects missing or malformed authorization", () => {
  for (const value of [null, "", "Basic qa-token", "Bearer   "]) {
    if (parseBearerToken(value) !== null) {
      throw new Error(`Expected malformed authorization to be rejected: ${value}`);
    }
  }
});
