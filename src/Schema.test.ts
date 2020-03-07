import FS from "fs-extra";
import Path from "path";

import { makeMigration, migrate, rollback, listMigrations, version, getTableNames, getSchemaForTable } from "./Schema";

import Database from "./Database";
import { emptyDatabase } from "./Schema";
import { uuid } from "./util";

let database: Database;

beforeEach(async () => {
  database = new Database();
  await emptyDatabase("drop", true);
});

afterEach(async () => {
  await database.disconnect();
  FS.removeSync(Path.join(__dirname, "..", "migrations"));
});

describe("Schema", () => {
  it("can migrate and rollback the database", async () => {
    expect.hasAssertions();

    // make a create migration
    const createFileName = await makeMigration("create-lists");
    const createFileContents = await FS.readFile(createFileName, "utf8");

    expect(createFileContents).toContain(`createTable("lists"`);
    expect(createFileContents).toContain(`dropTable("lists"`);

    expect(await version()).toBe("none");

    let migrations = await listMigrations();
    expect(migrations.pending.length).toBe(1);
    expect(migrations.pending).toContain(Path.basename(createFileName));
    expect(migrations.completed.length).toBe(0);

    // migrate
    await migrate();
    expect(await version()).toBe(Path.basename(createFileName));

    // make a modify migration
    const modifyFileName = await makeMigration("add-name-and-looked-at-and-thing-id-to-lists");
    const modifyFileContents = await FS.readFile(modifyFileName, "utf8");

    expect(modifyFileContents).toContain(`table("lists"`);
    expect(modifyFileContents).toContain(`table.string("name");`);
    expect(modifyFileContents).toContain(`table.timestamp("lookedAt");`);
    expect(modifyFileContents).toContain(`table.uuid("thingId");`);
    expect(modifyFileContents).toContain(`table.index("thingId");`);

    migrations = await listMigrations();
    expect(migrations.pending.length).toBe(1);
    expect(migrations.pending).toContain(Path.basename(modifyFileName));
    expect(migrations.completed.length).toBe(1);

    await migrate();
    expect(await version()).toBe(Path.basename(modifyFileName));

    migrations = await listMigrations();
    expect(migrations.pending.length).toBe(0);
    expect(migrations.completed.length).toBe(2);
    expect(migrations.completed).toContain(Path.basename(createFileName));
    expect(migrations.completed).toContain(Path.basename(modifyFileName));

    expect(await getTableNames()).toContain("lists");
    const schema = await getSchemaForTable("lists");
    expect(schema.id.type).toBe("uuid");
    expect(schema.createdAt.type).toBe("timestamp without time zone");
    expect(schema.updatedAt.type).toBe("timestamp without time zone");

    // rollback
    await rollback();

    expect(await version()).toBe(Path.basename(createFileName));

    migrations = await listMigrations();
    expect(migrations.pending.length).toBe(1);
    expect(migrations.pending[0]).toBe(Path.basename(modifyFileName));
    expect(migrations.completed.length).toBe(1);
    expect(migrations.completed[0]).toBe(Path.basename(createFileName));

    // rollback again to nothing
    await rollback();

    expect(await getTableNames()).not.toContain("lists");
    expect(getSchemaForTable("lists")).rejects.toThrow();
  });

  it("can truncate the database", async () => {
    await database.knex.schema.createTable("things", t => {
      t.uuid("id").primary();
      t.string("name");
    });

    // Put a thing in the database
    await database.knex("things").insert({ id: uuid(), name: "test" });
    let thing = await database
      .knex("things")
      .where({ name: "test" })
      .first();
    expect(thing.name).toBe("test");

    await emptyDatabase("truncate");

    const [{ count }] = await database.knex("things").count();
    expect(count).toBe("0");
  });
});
