#! /usr/bin/env node

const Chalk = require("chalk");
const Inflect = require("i")();

const {
  migrate,
  rollback,
  makeMigration,
  getTableNames,
  getSchemaForTable,
  listMigrations
} = require("../dist/Schema");

async function run() {
  // Remove `node` and `data`
  let args = process.argv.slice(2);

  // Execute command
  switch (args.shift()) {
    case "migration":
      return await runMakeMigration(args);

    case "up":
      return await runMigrate();

    case "down":
      return await runRollback();

    case "list":
      return await runList();

    case "schema":
      return await runSchema(args);

    case "types":
      return await runTypes(args);

    default:
      return await showUsage();
  }
}

async function showUsage() {
  console.log(`\n${Chalk.bold.blueBright("# @nathanhoad/data")}\n`);

  console.log(Chalk.bold("npx data migration <migration-name>"));
  console.log(Chalk.dim("Create a new migration\n"));

  console.log(Chalk.bold("npx data up"));
  console.log(Chalk.dim("Run any pending migrations\n"));

  console.log(Chalk.bold("npx data down"));
  console.log(Chalk.dim("Undo the last group of migrations\n"));

  console.log(Chalk.bold("npx data list"));
  console.log(Chalk.dim("Show a list of pending and completed migrations\n"));

  console.log(Chalk.bold("npx data schema [table]"));
  console.log(Chalk.dim("Show the schema for the database\n"));

  console.log(Chalk.bold("npx data types [table]"));
  console.log(Chalk.dim("Show the basic types for fields in each table (not including relations).\n"));
}

async function runMakeMigration(args) {
  if (args.length === 0) {
    console.log(Chalk.bold.red("\nNo migration name specified\n"));
    console.log(Chalk.dim("Usage: npx data migration <migration-name>\n"));
    return;
  }

  await makeMigration(args[0]);
}

async function runMigrate() {
  require("ts-node").register({ compilerOptions: { target: "es5", module: "commonjs" } });

  const { group, files } = await migrate();

  if (files.length === 0) {
    console.log(Chalk.dim("\nThere are no migrations to run\n"));
    return;
  }

  console.log(Chalk.bold.green(`\n# Migrated group ${group}`));
  files.forEach(console.log);
  console.log("");
}

async function runRollback() {
  require("ts-node").register({ compilerOptions: { target: "es5", module: "commonjs" } });

  const { group, files } = await rollback();

  if (files.length === 0) {
    console.log(Chalk.dim("\nThere are no migrations to roll back"));
    return;
  }

  console.log(Chalk.bold.yellow(`\n# Rolled back group ${group}\n`));
  files.forEach(console.log);
  console.log("");
}

async function runList() {
  const { completed, pending } = await listMigrations();

  console.log(`\n${Chalk.bold.yellow("# Pending migrations")}\n`);
  if (pending.length === 0) {
    console.log(Chalk.dim("There are no pending migrations"));
  }
  pending.map(file => {
    console.log(file.replace(/\.ts$/, ""));
  });

  console.log("");

  console.log(`${Chalk.bold.green("# Completed migrations")}\n`);
  if (completed.length === 0) {
    console.log(Chalk.dim("There are no completed migrations\n"));
  }
  completed.map(file => {
    console.log(file.replace(/\.ts$/, ""));
  });

  console.log("");
}

async function runSchema(args) {
  let tables = await getTableNames();
  if (args.length > 0) {
    tables = tables.filter(t => t === args[0]);
  }

  if (tables.length === 0) {
    console.log(Chalk.dim("\nThere are no tables\n"));
    return;
  }

  const tableSchemas = await Promise.all(tables.map(t => getSchemaForTable(t)));

  tableSchemas.forEach((tableSchema, index) => {
    console.log(Chalk.bold.green(`\n# ${tables[index]}\n`));
    Object.keys(tableSchema).forEach(key => {
      let meta = [];
      let column = tableSchema[key];

      if (column.nullable == "NO") {
        meta.push("not nullable");
      }
      if (column.defaultValue) {
        meta.push(`default ${column.defaultValue}`);
      }

      meta = meta.length > 0 ? Chalk.gray(`(${meta.join(", ")})`) : "";

      console.log(`${Chalk.bold(key)}: ${column.type} ${meta}`);
    });
  });
}

async function runTypes(args) {
  let tables = await getTableNames();
  if (args.length > 0) {
    tables = tables.filter(t => t === args[0]);
  }

  if (tables.length === 0) {
    console.log(Chalk.dim("\nThere are no tables\n"));
    return;
  }

  const tableSchemas = await Promise.all(tables.map(t => getSchemaForTable(t)));

  tableSchemas.forEach((tableSchema, index) => {
    console.log(
      `\n${Chalk.bold.yellowBright("interface")} I${Inflect.pluralize(Inflect.classify(tables[index]))}Model {`
    );
    Object.keys(tableSchema).forEach(key => {
      let column = tableSchema[key];

      let type;
      if (column.type.includes("character") || column.type.includes("uuid") || column.type.includes("text")) {
        type = "string";
      } else if (column.type.includes("timestamp")) {
        type = "Date";
      } else if (column.type.includes("integer")) {
        type = "number";
      }

      console.log(`  ${key}?: ${type};`);
    });
    console.log("}\n");
  });
}

run();
