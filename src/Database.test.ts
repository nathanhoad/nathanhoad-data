import Knex from "knex";
import Database from "./Database";
import { emptyDatabase } from "./Schema";
import { IModel } from "./types";

describe("Database", () => {
  it("can be initialised automatically", () => {
    expect.hasAssertions();

    const database = new Database();
    expect(database.knex).not.toBeNull();
    expect(database.isConnected).toBeTruthy();
  });

  it("can be initialised with a knex object", () => {
    expect.hasAssertions();

    const knex = Knex({
      client: "pg",
      connection: process.env.TEST_DATABASE_URL
    });

    const database = new Database(knex);
    expect(database.knex).not.toBeNull();
    expect(database.isConnected).toBeTruthy();
  });

  it("can connect and disconnect", async () => {
    expect.hasAssertions();

    // Start out not connected
    const database = new Database(false);
    expect(database.knex).toBeNull();
    expect(database.isConnected).toBeFalsy();

    // Should do nothing
    await database.disconnect();
    expect(database.knex).toBeNull();
    expect(database.isConnected).toBeFalsy();

    // Connect and then disconnect
    database.connect();
    expect(database.knex).not.toBeNull();
    expect(database.isConnected).toBeTruthy();

    await database.disconnect();
    expect(database.knex).toBeNull();
    expect(database.isConnected).toBeFalsy();
  });
});

describe("Transactions", () => {
  let database: Database;

  beforeEach(async () => {
    database = new Database();
    await emptyDatabase("drop");
  });

  afterEach(async () => {
    await database.disconnect();
  });

  it("It can create a model and fetch it within a transaction", async () => {
    expect.hasAssertions();

    await database.knex.schema.createTable("users", t => {
      t.uuid("id").primary();
      t.string("name");
      t.timestamp("createdAt");
      t.timestamp("updatedAt");
    });

    interface IUserModel extends IModel {
      name?: string;
    }

    const Users = database.model<IUserModel>("users");

    const nathan = { name: "Nathan" };

    await database.transaction(async transaction => {
      let n = await Users.create(nathan, { transaction });

      // Won't be found without passing the transaction
      let user = await Users.find(n.id);
      expect(user).toBeNull();

      // Can be found because we passed the transaction
      user = await Users.find(n.id, { transaction });
      expect(user.id).toBe(n.id);
    });

    const user = await Users.where({ name: nathan.name }).first();

    // Don't need to pass the transaction after it has been commited
    expect(user).not.toBeNull();
  });

  it("It can create a model and its relations within a transaction", async () => {
    expect.hasAssertions();

    await database.knex.schema.createTable("users", t => {
      t.uuid("id").primary();
      t.string("name");
      t.timestamp("createdAt");
      t.timestamp("updatedAt");
    });

    await database.knex.schema.createTable("projects", t => {
      t.uuid("id").primary();
      t.string("name");
      t.uuid("userId");
      t.timestamp("createdAt");
      t.timestamp("updatedAt");
    });

    interface IUserModel extends IModel {
      name?: string;
      projects?: IProjectModel[];
    }

    interface IProjectModel extends IModel {
      name?: string;
      user?: IUserModel;
    }

    const Users = database.model<IUserModel>("users", {
      relations: {
        projects: { hasMany: "projects" }
      }
    });

    const Projects = database.model<IProjectModel>("projects", {
      relations: {
        user: { belongsTo: "users" }
      }
    });

    const nathan = {
      name: "Nathan",
      projects: [
        {
          name: "Fun thing"
        },
        {
          name: "Less fun thing"
        }
      ]
    };

    await database.transaction(async transaction => {
      let n = await Users.create(nathan, { transaction });

      // Won't be found without passing the transaction
      let user = await Users.find(n.id);
      expect(user).toBeNull();

      // No projects have been commited from the transaction yet
      let projects = await Projects.all();
      expect(projects.length).toBe(0);
      let count = await Projects.count();
      expect(count).toBe(0);

      // Can be found because we passed the transaction
      user = await Users.find(n.id, { transaction });
      expect(user.id).toBe(n.id);

      projects = await Projects.all({ transaction });
      expect(projects.length).toBe(2);
      count = await Projects.count({ transaction });
      expect(count).toBe(2);
    });

    // Don't need to pass the transaction after it has been commited
    const user = await Users.where({ name: nathan.name }).first();

    expect(user).not.toBeNull();

    const projects = await Projects.all();
    expect(projects.length).toBe(2);

    // Then bulk destroy them
    await database.transaction(async transaction => {
      await Projects.bulkDestroy({ transaction });

      // Delete hasn't happened yet without transaction
      let count = await Projects.count();
      expect(count).toBe(2);

      // But its visible if we pass in the transaction
      count = await Projects.count({ transaction });
      expect(count).toBe(0);
    });
  });
});
