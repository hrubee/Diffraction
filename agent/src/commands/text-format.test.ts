import { describe, expect, it } from "vitest";
import { shortenText } from "./text-format.js";

describe("shortenText", () => {
  it("returns original text when it fits", () => {
    expect(shortenText("diffraction", 16)).toBe("diffraction");
  });

  it("truncates and appends ellipsis when over limit", () => {
    expect(shortenText("diffraction-status-output", 10)).toBe("diffraction-…");
  });

  it("counts multi-byte characters correctly", () => {
    expect(shortenText("hello🙂world", 7)).toBe("hello🙂…");
  });
});
