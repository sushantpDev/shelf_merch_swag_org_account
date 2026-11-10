import { describe, expect, it } from "vitest";
import { isSafeResumeUrl, safeOauthReturnPath } from "./safeOauthReturn";

describe("safeOauthReturnPath", () => {
  it("keeps the consent page and its query", () => {
    expect(safeOauthReturnPath("/oauth/consent")).toBe("/oauth/consent");
    expect(safeOauthReturnPath("/oauth/consent?x=1")).toBe("/oauth/consent?x=1");
  });

  it("rejects other paths and off-site targets", () => {
    expect(safeOauthReturnPath("/dashboard")).toBeNull();
    expect(safeOauthReturnPath("//evil.example/oauth/consent")).toBeNull();
    expect(safeOauthReturnPath("https://evil.example/oauth/consent")).toBeNull();
    expect(safeOauthReturnPath("/oauth/consent/session")).toBeNull();
    expect(safeOauthReturnPath("/oauth/consent/../login")).toBeNull();
  });
});

describe("isSafeResumeUrl", () => {
  it("accepts an authorization resume on the page origin", () => {
    expect(isSafeResumeUrl("http://localhost:8080/auth/abc", "http://localhost:8080")).toBe(true);
  });

  it("rejects another origin", () => {
    expect(isSafeResumeUrl("http://127.0.0.1:3001/auth/abc", "http://localhost:8080")).toBe(false);
    expect(isSafeResumeUrl("http://localhost:8080/oauth/consent", "http://localhost:8080")).toBe(false);
  });
});
