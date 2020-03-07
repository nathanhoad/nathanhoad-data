import { uuid, hashify, slugify } from "./util";

describe("Util", () => {
  describe("uuid()", () => {
    it("generates a uuid", () => {
      expect.hasAssertions();

      const id = uuid();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe("hashify()", () => {
    it("generates a hash", () => {
      expect.hasAssertions();

      let h = hashify("test");
      expect(h).toBe("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");

      h = hashify("test", 4);
      expect(h).toBe("9f86");
    });
  });

  describe("slugify()", () => {
    it("generates a slug", () => {
      expect.hasAssertions();

      let s = slugify("this is the title!");
      expect(s).toBe("this-is-the-title");

      s = slugify("this is the title!", 4);
      expect(s).toMatch(/this\-is\-the\-title\-[0-9a-fA-F]/);
    });
  });
});
