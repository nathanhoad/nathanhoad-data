import Database from "./Database";

const instance = new Database(false);
export function data() {
  instance.connect();
  return instance;
}

export { uuid, hashify, slugify, filterKeys } from "./util";
