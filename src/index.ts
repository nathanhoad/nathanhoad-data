import Database from "./Database";

const instance = new Database(false);
export default function data() {
  instance.connect();
  return instance;
}

export { Database };
export { IModel } from "./types";
export { uuid, hashify, slugify, filterKeys } from "./util";
