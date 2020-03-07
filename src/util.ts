import { v4 } from "uuid";
import Crypto from "crypto";

/**
 * Generate a uuid
 */
export function uuid() {
  return v4();
}

/**
 * Generate a hex digest from an input
 * @param seed the value to hash
 * @param length truncate the output to this length
 */
export function hashify(seed: string | number, length: number = 64): string {
  seed = seed || Math.random();

  return Crypto.createHash("sha256")
    .update(seed.toString(), "utf8")
    .digest("hex")
    .substring(0, length);
}

/**
 * Convert a sentence to a URL hash with an optional random hash on the end
 * @param string the sentence to slugify
 * @param hashLength add some a hash of this length to the end
 */
export function slugify(string: string, hashLength: number = 0): string {
  var slug = string
    .toLowerCase()
    .replace(/[\'\!\"\&\%]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/\-+/g, "-")
    .replace(/(^\-|\-$)/, "");
  if (hashLength > 0) {
    slug += "-" + hashify(null, hashLength);
  }

  return slug;
}

/**
 * Remove all but the given keys from an object
 * @param object
 * @param keys
 */
export function filterKeys(object: any, keys: string[]): any {
  const newObject = {};
  Object.keys(object).forEach(key => {
    if (keys.includes(key)) {
      newObject[key] = object[key];
    }
  });
  return newObject;
}
