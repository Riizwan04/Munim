import { describe, it, expect } from "vitest";
import { checkSupabaseConfig, isValidEmail } from "../src/index";

const URL = "https://aykaxusbjywmfuvhdryz.supabase.co", KEY = "sb_publishable_68EEykxSSCCSitk0PUe1cQ_bQ5TGopl";
describe("supabase config check", () => {
  it("accepts the real shape", () => expect(checkSupabaseConfig(URL, KEY)).toEqual([]));
  it("accepts a local dev URL", () => expect(checkSupabaseConfig("http://localhost:54321", KEY)).toEqual([]));
  it("missing values", () => expect(checkSupabaseConfig(undefined, "")).toEqual(["missing_url", "missing_key"]));
  it("the copied ellipsis, a space or a smart quote in the key is caught", () => {
    expect(checkSupabaseConfig(URL, "sb_publishable_…")).toEqual(["bad_key"]);
    expect(checkSupabaseConfig(URL, KEY + " ")).toEqual(["bad_key"]);
    expect(checkSupabaseConfig(URL, "“" + KEY + "”")).toEqual(["bad_key"]);
  });
  it("wrong URLs", () => {
    expect(checkSupabaseConfig("aykaxusbjywmfuvhdryz.supabase.co", KEY)).toEqual(["bad_url"]);
    expect(checkSupabaseConfig("https://example.com", KEY)).toEqual(["bad_url"]);
  });
  it("emails", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a b@c.com")).toBe(false);
    expect(isValidEmail("nope")).toBe(false);
  });
});
