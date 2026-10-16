import { describe, expect, it } from "vitest";
import { TelephoneInvalide, estTelephoneValide, normaliserTelephone } from "./telephone";

describe("normaliserTelephone", () => {
  it.each([
    ["+237 6 55 00 00 01", "+237655000001"],
    ["655000001", "+237655000001"],
    ["00237655000001", "+237655000001"],
    ["+237-655.00.00.01", "+237655000001"],
    ["+33 6 12 34 56 78", "+33612345678"],
  ])("%s -> %s", (brut, attendu) => {
    expect(normaliserTelephone(brut)).toBe(attendu);
  });

  it.each(["", "abc", "12345", "+0123456789", "65500000", "+2376550000011111111111", "6550000a1"])(
    "refuse %j",
    (brut) => {
      expect(() => normaliserTelephone(brut)).toThrow(TelephoneInvalide);
      expect(estTelephoneValide(brut)).toBe(false);
    },
  );
});
