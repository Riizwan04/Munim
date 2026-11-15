import { describe, it, expect } from "vitest";
import { numberToWords, rupeesToSpeech, qtyToSpeech, unitToSpeech, modeToSpeech, spellAcronyms, parseSpokenNumber, rupeesToPaise as R } from "../src/index";

describe("numbers as words", () => {
  it.each([
    [0, "zero"], [7, "seven"], [20, "twenty"], [45, "forty-five"], [100, "one hundred"], [360, "three hundred sixty"],
    [1000, "one thousand"], [28800, "twenty-eight thousand eight hundred"], [239910, "two lakh thirty-nine thousand nine hundred ten"],
    [1234567, "twelve lakh thirty-four thousand five hundred sixty-seven"], [10000000, "one crore"], [12000000, "one crore twenty lakh"],
  ])("English %i", (n, w) => expect(numberToWords(n, "en")).toBe(w));
  it.each([
    [0, "शून्य"], [10, "दस"], [45, "पैंतालीस"], [100, "एक सौ"], [360, "तीन सौ साठ"], [1000, "एक हज़ार"],
    [28800, "अट्ठाईस हज़ार आठ सौ"], [239910, "दो लाख उनतालीस हज़ार नौ सौ दस"], [10000000, "एक करोड़"],
  ])("Hindi %i", (n, w) => expect(numberToWords(n, "hi")).toBe(w));
  it("negative", () => { expect(numberToWords(-50, "en")).toBe("minus fifty"); expect(numberToWords(-50, "hi")).toContain("पचास"); });
  it("what Munim says can be understood by Munim: Hindi words parse back to the number", () => {
    for (const n of [5, 40, 360, 1500, 28800, 50000, 120000, 239910]) expect(parseSpokenNumber(numberToWords(n, "hi"))).toBe(n);
  });
  it("English words parse back too (what Munim says, Munim understands)", () => {
    for (const n of [5, 20, 45, 100, 360, 28800, 50000, 239910]) expect(parseSpokenNumber(numberToWords(n, "en"))).toBe(n);
  });
});

describe("rupees, quantities, units", () => {
  it("rupees", () => {
    expect(rupeesToSpeech(R(28800), "en")).toBe("twenty-eight thousand eight hundred rupees");
    expect(rupeesToSpeech(R(1), "en")).toBe("one rupee");
    expect(rupeesToSpeech(R(239910), "hi")).toBe("दो लाख उनतालीस हज़ार नौ सौ दस रुपये");
    expect(rupeesToSpeech(R(1), "hi")).toBe("एक रुपया");
    expect(rupeesToSpeech(-R(500), "en")).toBe("minus five hundred rupees");
  });
  it("fractions the way people say them", () => {
    expect(qtyToSpeech(1500, "hi")).toBe("डेढ़");
    expect(qtyToSpeech(2500, "hi")).toBe("ढाई");
    expect(qtyToSpeech(3500, "hi")).toBe("साढ़े तीन");
    expect(qtyToSpeech(500, "hi")).toBe("आधा");
    expect(qtyToSpeech(1250, "hi")).toBe("सवा एक");
    expect(qtyToSpeech(2750, "hi")).toBe("पौने तीन");
    expect(qtyToSpeech(1500, "en")).toBe("one and a half");
    expect(qtyToSpeech(80000, "en")).toBe("eighty");
    expect(qtyToSpeech(2250, "en")).toBe("two point two five");
  });
  it("units and modes", () => {
    expect(unitToSpeech("bag", 80000, "en")).toBe("bags");
    expect(unitToSpeech("bag", 1000, "en")).toBe("bag");
    expect(unitToSpeech("bag", 80000, "hi")).toBe("बैग");
    expect(unitToSpeech("mtr", 1500, "hi")).toBe("मीटर");
    expect(unitToSpeech("furlong", 1000, "en")).toBe("furlong");
    expect(modeToSpeech("upi", "hi")).toBe("यूपीआई");
  });
  it("acronyms are spelled out", () => {
    expect(spellAcronyms("JSW cement")).toBe("J S W cement");
    expect(spellAcronyms("Waddi and UPI")).toBe("Waddi and U P I");
  });
});
