import { describe, expect, it } from "vitest";
import { romanizeName, romanizeWord } from "../src";

describe("romanize: nothing written is in Devanagari", () => {
  it.each([
    ["एसीसी सीमेंट", "ACC Cement"], ["जेएसडब्ल्यू", "JSW"], ["रमेश", "Ramesh"], ["संतोष नाईक", "Santosh Naik"], ["रेती", "Sand"],
    ["वाडी सीमेंट", "Vadi Cement"], ["ACC सीमेंट", "ACC Cement"], ["Santosh Naik", "Santosh Naik"],
  ])("%s → %s", (a, b) => expect(romanizeName(a)).toBe(b));
  it("known shop words come from the list", () => { expect(romanizeWord("ईंट")).toBe("brick"); expect(romanizeWord("टाइल्स")).toBe("tiles"); });
  it("English words are untouched", () => expect(romanizeName("River Sand 6 inch")).toBe("River Sand 6 inch"));
  it("no Devanagari is ever left", () => expect(/[ऀ-ॿ]/.test(romanizeName("पंपाश्रीकृष्ण ज्ञान क्षमा सळई"))).toBe(false));
});
