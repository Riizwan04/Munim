import { describe, expect, it } from "vitest";
import { parseSpokenNumber } from "../src";

describe("mixed Hindi / English numbers", () => {
  it.each([
    ["390", 390], ["तीन सौ नब्बे", 390], ["three ninety", 390], ["थ्री नाइंटी", 390], ["थ्री हंड्रेड नाइंटी", 390],
    ["तीन सौ ninety", 390], ["three सौ नब्बे", 390], ["टू हजार", 2000], ["दस", 10], ["टेन", 10], ["फिफ्टी", 50],
  ])("%s → %d", (t, n) => expect(parseSpokenNumber(t)).toBe(n));
});
