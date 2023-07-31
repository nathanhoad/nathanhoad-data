import i from "i";
import FS from "fs-extra";
import Path from "path";
import ejs from "ejs";

import Database from "./Database";
import { TableSchema } from "./types";

const Inflect = i();

interface IMigrationResult {
  group: number;
  files: string[];
}

interface IMigrationList {
  completed: string[];
  pending: string[];
}

const migrationConfig = {
  tableName: "data_schema_migrations"
};

/**
 * Make a migration file
 * @param migrationName
 */
export async function makeMigration(migrationName: string): Promise<string> {
  const tableName = guessTableName(migrationName);

  const columns = [];
  const indices = [];
  guessColumnNames(migrationName).forEach((definition: any) => {
    columns.push({ name: definition.column, type: definition.type });
    if (definition.hasIndex) {
      indices.push({ name: definition.column });
    }
  });

  const template = migrationName.startsWith("create")
    ? await FS.readFile(__dirname + "/templates/createTable.ts.ejs", "utf8")
    : await FS.readFile(__dirname + "/templates/updateTable.ts.ejs", "utf8");

  const fileName =
    new Date()
      .toJSON()
      .replace(/[^0-9]+/g, "")
      .toString() +
    "-" +
    Inflect.dasherize(
      migrationName
        .toLowerCase()
        .replace(/[^0-9a-z\-]/g, "_")
        .replace(/\s+/, "_")
    ) +
    ".ts";
  const fileContents = ejs.render(template, { tableName, columns, indices });

  // TODO: should the migrations folder location be configurable?
  const migrationsPath = Path.join(guessRootPath(), "migrations");
  await FS.ensureDir(migrationsPath);
  const path = Path.join(migrationsPath, fileName);
  await FS.writeFile(path, fileContents);

  return path;
}

/**
 * Migrate the database
 */
export async function migrate(): Promise<IMigrationResult> {
  const database = new Database();
  database.connect();

  // Run migrations on the main db
  const [group, files] = await database.knex.migrate.latest(migrationConfig);

  // Run migrations on the test db too
  database.disconnect();
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  database.connect();
  try {
    await database.knex.migrate.latest(migrationConfig);
  } catch (err) {
    // Already migrated (most likely we are running our own tests)
  }

  process.env.NODE_ENV = previousNodeEnv;
  await database.disconnect();

  return {
    group,
    files
  };
}

/**
 * Rollback the last group
 */
export async function rollback(): Promise<IMigrationResult> {
  const database = new Database();
  database.connect();

  // Rollback migrations on the main db
  const [group, files] = await database.knex.migrate.rollback(migrationConfig);

  // Rollback migrations on the test db
  database.disconnect();
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  database.connect();
  try {
    await database.knex.migrate.rollback();
  } catch (err) {
    // Already rolled back (most likely we are running our own tests)
  }
  process.env.NODE_ENV = previousNodeEnv;

  await database.disconnect();

  return {
    group,
    files
  };
}

/**
 * Get the version of the schema
 */
export async function version(): Promise<string> {
  const database = new Database();
  database.connect();

  const version = await database.knex.migrate.currentVersion(migrationConfig);

  await database.disconnect();

  return version;
}

/**
 * Get the list of pending and previous migrations
 */
export async function listMigrations(): Promise<IMigrationList> {
  const database = new Database();

  const [completed, pending] = await database.knex.migrate.list(migrationConfig);

  await database.disconnect();

  return {
    completed: completed.map(c => c.name),
    pending: pending.map(m => m.file)
  };
}

/**
 * Get a list of the table names in this database
 */
export async function getTableNames(): Promise<string[]> {
  const database = new Database();
  database.connect();

  const { rows } = await database.knex.raw(
    "select table_name from information_schema.tables where table_schema = 'public'"
  );

  await database.disconnect();

  return rows.map((row: any) => row.table_name).filter((tableName: any) => !tableName.includes("schema_migrations"));
}

/**
 * Get the schema for a table
 * @param tableName
 */
export async function getSchemaForTable(tableName: string): Promise<TableSchema> {
  const database = new Database();
  database.connect();

  const schema = ((await database.knex(tableName).columnInfo()) as any) as TableSchema;
  await database.disconnect();

  if (Object.keys(schema).length === 0) throw new Error(`There is no table called "${tableName}"`);

  return schema;
}

/**
 * Empty the database (or drop it)
 * @param action
 * @param includeSchema
 */
export async function emptyDatabase(
  action: "truncate" | "drop" = "truncate",
  includeSchema: boolean = false
): Promise<any> {
  // Force the env to be test (we never want to truncate the real database)
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";

  const database = new Database();
  database.connect();

  let { rows } = await database.knex.raw(
    "select table_name from information_schema.tables where table_schema = 'public'"
  );

  if (includeSchema) {
    rows = rows.filter((t: any) => !t.table_name.includes("schema_migrations"));
  }

  await Promise.all(
    rows.map(t => {
      if (action === "drop") {
        return database.knex.schema.dropTable(t.table_name);
      } else {
        return database.knex(t.table_name).truncate();
      }
    })
  );

  await database.disconnect();
  process.env.NODE_ENV = previousNodeEnv;
}

/**
 * Find the root of the project
 * @param startingDirectory
 */
/* istanbul ignore next */
function guessRootPath(startingDirectory: string = process.cwd()): string {
  // Allow for overriding the root path
  if (process.env.PROJECT_ROOT_PATH) return process.env.PROJECT_ROOT_PATH;

  let currentDirectory = startingDirectory;
  let projectDirectory = null;

  let levels = 50;
  while (currentDirectory.length > 0 && !projectDirectory && levels-- > 0) {
    if (
      FS.readdirSync(currentDirectory).includes("node_modules") ||
      FS.readdirSync(currentDirectory).includes("package.json")
    ) {
      projectDirectory = currentDirectory;
    } else {
      currentDirectory = Path.dirname(currentDirectory);
    }
  }

  return projectDirectory;
}

/**
 * Guess the name of the table based on the name of the migration
 * @param migrationName
 */
function guessTableName(migrationName: string): string {
  let tableName = "";

  if (migrationName.startsWith("create-")) {
    tableName = Inflect.underscore(migrationName.replace(/^create-/, ""));
  } else {
    let matches = migrationName.match(/^(.*?)-(to|for|on)-(.*?)$/);
    if (matches && matches.length == 4) {
      tableName = Inflect.underscore(matches[3]);
    }
  }

  return tableName;
}

/**
 * Try and guess column names from a migration name
 * @param migrationName
 */
function guessColumnNames(migrationName: string = ""): { column: string; type: string; hasIndex: boolean }[] {
  // We were given a migration name
  const matches = migrationName.match(/^(add|update)\-(.*?)-(to|for|on)-(.*?)$/);

  if (!matches || matches.length < 5) return [];

  return matches[2].split("-and-").map((c: string) => {
    const column = Inflect.camelize(Inflect.underscore(c), false);

    let type = "string";
    let hasIndex = false;
    if (column.match(/At$/)) {
      type = "timestamp";
      hasIndex = true;
    } else if (column.match(/Id$/)) {
      type = "uuid";
      hasIndex = true;
    }

    return {
      column,
      type,
      hasIndex
    };
  });
}
