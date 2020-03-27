import { filterKeys } from "./util";
import Database from "./Database";
import { emptyDatabase } from "./Schema";
import { IModel } from "./types";
import { uuid } from "./util";

let database: Database;

beforeEach(async () => {
  database = new Database();
  await emptyDatabase("drop");
});

afterEach(async () => {
  await database.disconnect();
});

describe("Queries", () => {
  it("can build independent queries", () => {
    expect.hasAssertions();

    interface IUserModel extends IModel {
      email: string;
    }

    const Users = database.model<IUserModel>("users");

    // Basic where
    expect(Users.where({ email: "test@test.com" }).toString()).toBe(
      `select * from "users" where "email" = 'test@test.com'`
    );

    // Where like
    expect(Users.where("email", "like", "%test%").toString()).toBe(`select * from "users" where "email" like '%test%'`);

    // Pagig
    expect(
      Users.where({ name: "Test" })
        .page(3, 20)
        .toString()
    ).toBe(`select * from "users" where "name" = 'Test' limit 20 offset 40`);

    // Order
    expect(Users.order("createdAt", "DESC").toString()).toBe(`select * from "users" order by "createdAt" DESC`);

    // Where in
    expect(Users.whereIn("name", ["Nathan", "Lilly"]).toString()).toBe(
      `select * from "users" where "name" in ('Nathan', 'Lilly')`
    );

    // Where not in
    expect(Users.whereNotIn("name", ["Nathan", "Lilly"]).toString()).toBe(
      `select * from "users" where "name" not in ('Nathan', 'Lilly')`
    );

    // Where null
    expect(Users.whereNull("name").toString()).toBe(`select * from "users" where "name" is null`);

    // Where not null
    expect(Users.whereNotNull("name").toString()).toBe(`select * from "users" where "name" is not null`);
  });
});

describe("Instances", () => {
  it("can create a new instance", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb");

    interface IListModel extends IModel {
      name: string;
      tasks: string[];
    }

    const Lists = database.model<IListModel>("lists");

    const newList = {
      name: "Todo",
      tasks: ["first", "second", "third"]
    };

    let list = await Lists.create(newList);

    expect(list.name).toBe(newList.name);
    expect(list.tasks.length).toBe(newList.tasks.length);
  });

  it("can save/restore/destroy an instance", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb");

    interface IListModel extends IModel {
      name: string;
      tasks: string[];
    }

    const Lists = database.model<IListModel>("lists");

    const newList = {
      name: "Todo",
      tasks: ["first", "second", "third"]
    };

    let list = await Lists.create(newList);

    list = await Lists.find(list.id);

    expect(list.name).toBe(newList.name);
    expect(list.tasks.length).toBe(newList.tasks.length);
    expect(list.tasks[0]).toBe(newList.tasks[0]);

    list = await Lists.save({
      ...list,
      name: "New name",
      tasks: [...list.tasks, "fourth"]
    });

    list = await Lists.where({ name: "New name" }).first();

    expect(list.name).toBe("New name");
    expect(list.tasks.length).toBe(newList.tasks.length + 1);
    expect(list.tasks[list.tasks.length - 1]).toBe("fourth");

    let deletedList = await Lists.destroy(list);

    list = await Lists.find(deletedList.id);
    expect(list).toBeNull();
  });
});

describe("Collections", () => {
  it("can count items", async () => {
    expect.hasAssertions();

    await createTable("items", "name:string");

    interface IItemModel extends IModel {
      name: string;
    }

    const Items = database.model<IItemModel>("items");

    const items = [
      {
        name: "Todo"
      },
      {
        name: "Done"
      }
    ];

    await Items.save(items);

    let count = await Items.count();
    expect(count).toBe(2);

    count = await Items.where({ name: "Done" }).count();
    expect(count).toBe(1);
  });

  it("can save/restore a collection", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb");

    interface IListModel extends IModel {
      name: string;
      tasks: string[];
    }

    const Lists = database.model<IListModel>("lists");

    const newLists = [
      {
        name: "Todo",
        tasks: ["first", "second", "third"]
      },
      {
        name: "Done",
        tasks: ["one", "two"]
      }
    ];

    let lists = await Lists.create(newLists);
    expect(lists[0].name).toBe(newLists[0].name);

    lists = await Lists.all();
    expect(lists.length).toBe(2);
  });

  it("can delete a collection", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb");

    interface IListModel extends IModel {
      name: string;
      tasks: string[];
    }

    const onDestroy = jest.fn();

    const Lists = database.model<IListModel>("lists", {
      hooks: {
        beforeDestroy() {
          onDestroy();
        }
      }
    });

    const newLists = [
      {
        name: "Todo",
        tasks: ["first", "second", "third"]
      },
      {
        name: "Done",
        tasks: ["one", "two"]
      }
    ];

    let lists = await Lists.save(newLists);
    lists = await Lists.all();
    expect(lists.length).toBe(2);

    // Destroy the lists
    await Lists.destroy(lists);

    expect(onDestroy).toHaveBeenCalledTimes(2);

    lists = await Lists.all();
    expect(lists.length).toBe(0);
  });

  it("can bulk delete a collection", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb");

    interface IListModel extends IModel {
      name: string;
      tasks: string[];
    }

    const Lists = database.model<IListModel>("lists");

    const newLists = [
      {
        name: "Todo",
        tasks: ["first", "second", "third"]
      },
      {
        name: "Done",
        tasks: ["one", "two"]
      }
    ];

    let lists = await Lists.save(newLists);
    lists = await Lists.all();
    expect(lists.length).toBe(2);

    // Destroy the lists
    await Lists.whereIn(
      "id",
      lists.map(l => l.id)
    ).bulkDestroy();

    lists = await Lists.all();
    expect(lists.length).toBe(0);
  });

  it("can list models that match a jsonb query", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb");

    interface IListModel extends IModel {
      name: string;
      tasks: Array<{
        id: string;
        category: string;
        description: string;
      }>;
    }

    const Lists = database.model<IListModel>("lists");

    const newLists = [
      {
        name: "Todo",
        tasks: [
          {
            id: uuid(),
            category: "work",
            description: "Finish writing tests"
          },
          {
            id: uuid(),
            category: "not work",
            description: "Play Animal Crossing"
          }
        ]
      },
      {
        name: "Done",
        tasks: [
          {
            id: uuid(),
            category: "work",
            description: "Implement json field searching"
          }
        ]
      }
    ];

    await Lists.save(newLists);
    const lists = await Lists.all();
    expect(lists).toHaveLength(2);

    // 'work' should find both lists
    const both = await Lists.whereJSONBContains("tasks", { category: "work" }).all();
    expect(both).toHaveLength(2);

    // 'not work' should just be Todo
    const justTodo = await Lists.whereJSONBContains("tasks", { category: "not work" }).all();
    expect(justTodo).toHaveLength(1);
    expect(justTodo[0].name).toBe("Todo");
  });
});

describe("Context", () => {
  it("can limit model fields to a context", () => {
    expect.hasAssertions();

    interface IUserModel extends IModel {
      firstName?: string;
      lastName?: string;
      email?: string;
    }

    const Users = database.model<IUserModel>("users", {
      contexts: {
        special(user) {
          return {
            ...user,
            isSpecial: true
          };
        },
        simple: ["firstName", "lastName"]
      }
    });

    const user = {
      firstName: "Nathan",
      lastName: "Hoad",
      email: "test@test.com",
      createdAt: new Date()
    };

    const json1 = Users.withContext(user, "special");
    expect(json1 instanceof Object).toBeTruthy();
    expect(json1.firstName).toBe(user.firstName);
    expect(json1.isSpecial).toBeTruthy();

    const json2 = Users.withContext(user, "simple");
    expect(json2 instanceof Object).toBeTruthy();
    expect(Object.keys(json2).length).toBe(2);
    expect(json2.firstName).toBe(user.firstName);

    const json3 = Users.withContext(user);
    expect(json3 instanceof Object).toBeTruthy();
    expect(Object.keys(json3).length).toBe(Object.keys(user).length);
    expect(json3.firstName).toBe(user.firstName);
    expect(json3.email).toBe(user.email);

    function name(user: any) {
      return {
        fullName: user.firstName + " " + user.lastName
      };
    }

    const json5 = Users.withContext(user, name);
    expect(json5 instanceof Object).toBeTruthy();
    expect(Object.keys(json5).length).toBe(1);
    expect(json5.fullName).toBe(user.firstName + " " + user.lastName);
  });

  it("can limit a list of models to a context", () => {
    expect.hasAssertions();

    interface IUserModel extends IModel {
      firstName?: string;
      lastName?: string;
      email?: string;
    }

    const Users = database.model<IUserModel>("users", {
      contexts: {
        special(user) {
          return {
            ...user,
            isSpecial: true
          };
        }
      }
    });

    const users = [
      {
        firstName: "Nathan",
        lastName: "Hoad",
        email: "test@test.com",
        createdAt: new Date()
      },
      {
        firstName: "Lilly",
        lastName: "Piri",
        email: "lilly@test.com",
        createdAt: new Date()
      }
    ];

    const json1 = Users.withContext(users, "special");

    expect(json1.length).toBe(2);
    expect(json1 instanceof Array).toBeTruthy();
    expect(json1[0].firstName).toBe(users[0].firstName);
    expect(json1[0].isSpecial).toBeTruthy();
    expect(json1[1].firstName).toBe(users[1].firstName);
    expect(json1[1].isSpecial).toBeTruthy();

    const json2 = Users.withContext(users);
    expect(json2.length).toBe(2);
    expect(json2 instanceof Array).toBeTruthy();
    expect(json2[0].firstName).toBe(users[0].firstName);
    expect(Object.keys(json2[0]).length).toBe(Object.keys(users[0]).length);
    expect(json2[1].firstName).toBe(users[1].firstName);
    expect(Object.keys(json2[1]).length).toBe(Object.keys(users[1]).length);
  });

  it("defaults to using the default context if it exists", () => {
    expect.hasAssertions();

    interface IUserModel extends IModel {
      firstName?: string;
      lastName?: string;
      email?: string;
    }

    const Users = database.model<IUserModel>("users", {
      contexts: {
        default(user) {
          return {
            ...user,
            usedDefault: true
          };
        }
      }
    });

    const user = {
      firstName: "Nathan",
      lastName: "Hoad",
      email: "test@test.com",
      createdAt: new Date()
    };

    const json1 = Users.withContext(user);
    expect(json1.usedDefault).toBeTruthy();

    const json2 = Users.withContext([user, user]);
    expect(json2[0].usedDefault).toBeTruthy();
  });

  it("returns the object if using default and there are no contexts", () => {
    expect.hasAssertions();

    interface IUserModel extends IModel {
      firstName?: string;
      lastName?: string;
      email?: string;
    }

    const Users = database.model<IUserModel>("users");

    const user = {
      firstName: "Nathan",
      lastName: "Hoad",
      email: "test@test.com",
      createdAt: new Date()
    };

    const json1 = Users.withContext(user);
    expect(Object.keys(json1).length).toBe(4);
  });

  it("it throws if the requested context doesn't exist", () => {
    expect.hasAssertions();

    interface IUserModel extends IModel {
      firstName?: string;
      lastName?: string;
      email?: string;
    }

    const Users = database.model<IUserModel>("users", {
      contexts: {
        anotherOne: ["lastName"]
      }
    });

    const user = {
      firstName: "Nathan",
      lastName: "Hoad",
      email: "test@test.com",
      createdAt: new Date()
    };

    expect(() => {
      Users.withContext(user, "unknown");
    }).toThrow();
  });

  it("it throws if a context is requested and there are no contexts", () => {
    expect.hasAssertions();

    interface IUserModel extends IModel {
      firstName?: string;
      lastName?: string;
      email?: string;
    }

    const Users = database.model<IUserModel>("users");

    const user = {
      firstName: "Nathan",
      lastName: "Hoad",
      email: "test@test.com",
      createdAt: new Date()
    };

    expect(() => {
      Users.withContext(user, "unknown");
    }).toThrow();
  });

  it("can limit a model that has relations on it to a context ", () => {
    expect.hasAssertions();

    interface IUserModel extends IModel {
      firstName?: string;
      lastName?: string;
      email?: string;

      hats?: IHatModel[];
    }

    const Users = database.model<IUserModel>("users", {
      relations: {
        hats: { hasMany: "hats" }
      },
      contexts: {
        simple: ["firstName", "hats"],
        special(user) {
          user = filterKeys(user, ["firstName", "email", "hats"]);

          if (user.hats) {
            user.hats = database.model("hats").withContext(user.hats, "simple");
          }

          return user;
        }
      }
    });

    interface IHatModel extends IModel {
      type?: string;

      user?: IUserModel;
    }

    database.model<IHatModel>("hats", {
      relations: {
        user: { belongsTo: "users" }
      },
      contexts: {
        simple: ["type"]
      }
    });

    const userWithHats = {
      firstName: "Nathan",
      lastName: "Hoad",
      email: "test@test.com",
      createdAt: new Date(),
      hats: [
        {
          type: "cowboy",
          size: "L"
        },
        {
          type: "cap",
          size: "L"
        }
      ]
    };

    const userWithNoHats = {
      firstName: "Nothan",
      lastName: "Hoats",
      email: "test@test.com",
      createdAt: new Date()
    };

    const json1 = Users.withContext(userWithHats, "simple");
    expect(json1.firstName).toBe(userWithHats.firstName);
    expect(json1.lastName).toBeUndefined();
    expect(json1.hats.length).toBe(2);
    expect(json1.hats[0].type).toBe(userWithHats.hats[0].type);
    expect(json1.hats[0].size).toBeUndefined();

    const json2 = Users.withContext(userWithHats, "special");
    expect(json2.firstName).toBe(userWithHats.firstName);
    expect(json2.hats.length).toBe(2);
    expect(json2.hats[0].type).toBe(userWithHats.hats[0].type);
    expect(json2.hats[0].size).toBeUndefined();

    const json3 = Users.withContext(userWithNoHats, "special");
    expect(json3.firstName).toBe(userWithNoHats.firstName);
    expect(json3.hats).toBeUndefined();
  });
});

describe("Schema", () => {
  it("can load the schema for a model", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb");

    interface IListModel extends IModel {
      name: string;
      tasks: string[];
    }

    const Lists = database.model<IListModel>("lists");

    const schema = await Lists.schema();

    const keys = Object.keys(schema);
    expect(keys.length).toBe(5);
    expect(keys).toContain("id");
    expect(keys).toContain("name");
    expect(keys).toContain("tasks");
    expect(keys).toContain("createdAt");
    expect(keys).toContain("updatedAt");

    expect(schema.id.nullable).toBeFalsy();
    expect(schema.id.type).toBe("uuid");

    expect(schema.name.maxLength).toBe(255);

    expect(schema.tasks.type).toBe("jsonb");
  });
});

describe("Hooks", () => {
  it("exposes beforeCreate", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb", "dueDate:timestamp");

    interface IListModel extends IModel {
      name?: string;
      tasks?: string[];
      dueDate?: Date;
    }

    const Lists = database.model<IListModel>("lists", {
      hooks: {
        beforeCreate(list) {
          list.dueDate = new Date(2020, 0, 1);
        }
      }
    });

    const list = await Lists.create({ name: "New List" });

    expect(list.dueDate).not.toBeUndefined();
    expect(list.dueDate.getFullYear()).toBe(2020);
  });

  it("cancels a save when beforeCreate throws", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb", "dueDate:timestamp");

    interface IListModel extends IModel {
      name?: string;
      tasks?: string[];
    }

    const Lists = database.model<IListModel>("lists", {
      hooks: {
        beforeCreate(list) {
          throw new Error();
        }
      }
    });

    const list = await Lists.create({ name: "New List" });

    expect(list.name).toBe("New List");
    expect(list.id).toBeUndefined();
  });

  it("exposes beforeSave", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb", "saveCount:integer");

    interface IListModel extends IModel {
      name?: string;
      tasks?: string[];
      saveCount?: number;
    }

    const Lists = database.model<IListModel>("lists", {
      hooks: {
        beforeSave(list) {
          list.saveCount = (list.saveCount || 0) + 1;
        }
      }
    });

    let list = await Lists.create({ name: "New List" });

    expect(list.saveCount).not.toBeUndefined();
    expect(list.saveCount).toBe(1);

    list = await Lists.save(list);

    expect(list.saveCount).toBe(2);
  });

  it("exposes afterCreate", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb");

    interface IListModel extends IModel {
      name?: string;
      tasks?: string[];
    }

    const didSave = jest.fn();

    const Lists = database.model<IListModel>("lists", {
      hooks: {
        afterCreate(list) {
          didSave();
        }
      }
    });

    let list = await Lists.create({ name: "New List" });

    expect(list.name).toBe("New List");
    expect(didSave).toHaveBeenCalled();
  });

  it("exposes afterSave", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb");

    interface IListModel extends IModel {
      name?: string;
      tasks?: string[];
    }

    const didSave = jest.fn();

    const Lists = database.model<IListModel>("lists", {
      hooks: {
        afterSave(list) {
          didSave();
        }
      }
    });

    let list = await Lists.create({ name: "New List" });

    expect(list.name).toBe("New List");
    expect(didSave).toHaveBeenCalled();
  });

  it("exposes beforeDestroy", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb");

    interface IListModel extends IModel {
      name?: string;
      tasks?: string[];
    }

    const didDestroy = jest.fn();

    const Lists = database.model<IListModel>("lists", {
      hooks: {
        beforeDestroy(list) {
          didDestroy();
        }
      }
    });

    let list = await Lists.create({ name: "New List" });
    await Lists.destroy(list);

    expect(didDestroy).toHaveBeenCalled();
  });

  it("cancels a destroy when beforeDestroy throws", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb", "dueDate:timestamp");

    interface IListModel extends IModel {
      name?: string;
      tasks?: string[];
    }

    const didTryDestroy = jest.fn();
    const Lists = database.model<IListModel>("lists", {
      hooks: {
        beforeDestroy(list) {
          didTryDestroy();
          throw new Error();
        }
      }
    });

    let list = await Lists.create({ name: "New List" });
    expect(list.id).not.toBeUndefined();

    Lists.destroy(list);

    list = await Lists.find(list.id);
    expect(didTryDestroy).toHaveBeenCalled();
    expect(list).not.toBeNull();
  });

  it("exposes afterDestroy", async () => {
    expect.hasAssertions();

    await createTable("lists", "name:string", "tasks:jsonb");

    interface IListModel extends IModel {
      name?: string;
      tasks?: string[];
    }

    const didDestroy = jest.fn();

    const Lists = database.model<IListModel>("lists", {
      hooks: {
        afterDestroy(list) {
          didDestroy();
        }
      }
    });

    let list = await Lists.create({ name: "New List" });
    await Lists.destroy(list);

    expect(didDestroy).toHaveBeenCalled();
  });

  it("runs a bunch of hooks", async () => {
    expect.hasAssertions();

    let beforeCreate = 0;
    let beforeSave = 0;
    let afterSave = 0;
    let afterCreate = 0;
    let beforeDestroy = 0;
    let afterDestroy = 0;

    let order = 1;

    await createTable("lists", "name:string", "tasks:jsonb");

    interface IListModel extends IModel {
      name?: string;
      tasks?: string[];
    }

    const Lists = database.model<IListModel>("lists", {
      hooks: {
        beforeCreate() {
          beforeCreate = order++;
        },
        beforeSave() {
          beforeSave = order++;
        },
        afterSave() {
          afterSave = order++;
        },
        afterCreate() {
          afterCreate = order++;
        },
        beforeDestroy() {
          beforeDestroy = order++;
        },
        afterDestroy() {
          afterDestroy = order++;
        }
      }
    });

    let list = await Lists.create({ name: "New List" });
    await Lists.destroy(list);

    expect(beforeCreate).toBe(1);
    expect(beforeSave).toBe(2);
    expect(afterSave).toBe(3);
    expect(afterCreate).toBe(4);
    expect(beforeDestroy).toBe(5);
    expect(afterDestroy).toBe(6);
  });
});

describe("Relations", () => {
  it("can load belongsTo, hasOne, and hasMany relations", async () => {
    expect.hasAssertions();

    await createTable("users", "name:string", "teamId:uuid");
    await createTable("teams", "name:string");
    await createTable("profiles", "bio:string", "teamId:uuid");

    interface IUserModel extends IModel {
      name: string;
      team?: ITeamModel;
    }

    interface ITeamModel extends IModel {
      name: string;
      users?: IUserModel[];
      profile?: IProfileModel;
    }

    interface IProfileModel extends IModel {
      bio: string;
      team?: ITeamModel;
    }

    const Users = database.model<IUserModel>("users", {
      relations: {
        team: { belongsTo: "team" }
      }
    });
    const Teams = database.model<ITeamModel>("teams", {
      relations: {
        users: { hasMany: "users" },
        profile: { hasOne: "profile" }
      }
    });
    const Profiles = database.model<IProfileModel>("profiles", {
      relations: {
        team: { belongsTo: "team" }
      }
    });

    const newTeams = [
      {
        id: uuid(),
        name: "Awesome"
      },
      {
        id: uuid(),
        name: "Gamers"
      }
    ];

    const newUsers = [
      {
        name: "Nathan",
        teamId: newTeams[0].id
      },
      {
        name: "Lilly",
        teamId: newTeams[0].id
      },
      {
        name: "Ben",
        teamId: newTeams[1].id
      }
    ];

    const newProfiles = [
      {
        bio: "We are the best, obviously",
        teamId: newTeams[0].id
      },
      {
        bio: "Overcooked is our religion",
        teamId: newTeams[1].id
      }
    ];

    await Users.create(newUsers);

    let teams = await Teams.create(newTeams);
    let profiles = await Profiles.create(newProfiles);
    let users = await Users.include("team").all();
    expect(users.length).toBe(3);

    let nathan = users.find(u => u.name === "Nathan");
    expect(nathan).toBeTruthy();
    expect(nathan.team.name).toBe(newTeams[0].name);

    let lilly = users.find(u => u.name === "Lilly");
    expect(lilly).toBeTruthy();
    expect(lilly.team.name).toBe(newTeams[0].name);

    let ben = users.find(u => u.name === "Ben");
    expect(ben).toBeTruthy();
    expect(ben.team.name).toBe(newTeams[1].name);

    teams = await Teams.include("users").all();
    expect(teams.length).toBe(2);
    expect(teams.find(t => t.name === newTeams[0].name).users.length).toBe(2);
    expect(teams.find(t => t.name === newTeams[1].name).users.length).toBe(1);

    teams = await Teams.include("profile").all();

    expect(teams.length).toBe(2);
    expect(teams.find(t => t.name == newTeams[0].name).profile.bio).toBe(newProfiles[0].bio);
    expect(teams.find(t => t.name == newTeams[1].name).profile.bio).toBe(newProfiles[1].bio);

    teams = await Teams.where({ name: newTeams[0].name }).all();
    expect(teams.length).toBe(1);
    expect(teams[0].users).toBeUndefined();
    expect(teams[0].profile).toBeUndefined();
  });

  it("can load belongsTo, hasOne, and hasMany relations with different keys", async () => {
    expect.hasAssertions();

    await createTable("users", "name:string", "team_id:uuid");
    await createTable("teams", "name:string");
    await createTable("profiles", "bio:string", "team_id:uuid");

    interface IUserModel extends IModel {
      name: string;
      team?: ITeamModel;
    }

    interface ITeamModel extends IModel {
      name: string;
      users?: IUserModel[];
      profile?: IProfileModel;
    }

    interface IProfileModel extends IModel {
      bio: string;
      team?: ITeamModel;
    }

    const Users = database.model<IUserModel>("users", {
      relations: {
        team: { belongsTo: "team", foreignKey: "team_id" }
      }
    });
    const Teams = database.model<ITeamModel>("teams", {
      relations: {
        users: { hasMany: "users", foreignKey: "team_id" },
        profile: { hasOne: "profile", foreignKey: "team_id" }
      }
    });
    const Profiles = database.model<IProfileModel>("profiles", {
      relations: {
        team: { belongsTo: "teams", foreignKey: "team_id" }
      }
    });

    const newTeams = [
      {
        id: uuid(),
        name: "Awesome"
      },
      {
        id: uuid(),
        name: "Gamers"
      }
    ];

    const newUsers = [
      {
        name: "Nathan",
        team_id: newTeams[0].id
      },
      {
        name: "Lilly",
        team_id: newTeams[0].id
      },
      {
        name: "Ben",
        team_id: newTeams[1].id
      }
    ];

    const newProfiles = [
      {
        bio: "We are the best, obviously",
        team_id: newTeams[0].id
      },
      {
        bio: "Overcooked is our religion",
        team_id: newTeams[1].id
      }
    ];

    await Users.create(newUsers);
    await Teams.create(newTeams);
    await Profiles.create(newProfiles);

    let users = await Users.include("team").all();

    expect(users.length).toBe(3);

    let nathan = users.find(u => u.name === "Nathan");
    expect(nathan).toBeTruthy();
    expect(nathan.team.name).toBe(newTeams[0].name);

    let lilly = users.find(u => u.name === "Lilly");
    expect(lilly).toBeTruthy();
    expect(lilly.team.name).toBe(newTeams[0].name);

    let ben = users.find(u => u.name === "Ben");
    expect(ben).toBeTruthy();
    expect(ben.team.name).toBe(newTeams[1].name);

    let teams = await Teams.include("users").all();

    expect(teams.length).toBe(2);
    expect(teams.find(t => t.name === newTeams[0].name).users.length).toBe(2);
    expect(teams.find(t => t.name === newTeams[1].name).users.length).toBe(1);

    teams = await Teams.include("profile").all();
    expect(teams.length).toBe(2);
    expect(teams.find(t => t.name == newTeams[0].name).profile.bio).toBe(newProfiles[0].bio);
    expect(teams.find(t => t.name == newTeams[1].name).profile.bio).toBe(newProfiles[1].bio);
  });

  it("can load hasAndBelongsToMany relations", async () => {
    expect.hasAssertions();

    await createTable("users", "name:string");
    await createTable("projects_users", "userId:uuid", "projectId:uuid");
    await createTable("projects", "name:string");

    interface IUserModel extends IModel {
      name: string;
      project?: IProjectModel;
    }

    interface IProjectModel extends IModel {
      name: string;
      users?: IUserModel[];
    }

    interface IProjectUsersModel extends IModel {
      userId: string;
      projectId: string;
    }

    const Users = database.model<IUserModel>("users", {
      relations: {
        projects: { hasAndBelongsToMany: "projects" }
      }
    });
    const Projects = database.model<IProjectModel>("projects", {
      relations: {
        users: { hasAndBelongsToMany: "users" }
      }
    });
    const ProjectsUsers = database.model<IProjectUsersModel>("projects_users");

    const newProjects = [
      {
        id: uuid(),
        name: "Awesome Game"
      },
      {
        id: uuid(),
        name: "Design"
      }
    ];

    const newUsers = [
      {
        id: uuid(),
        name: "Nathan"
      },
      {
        id: uuid(),
        name: "Lilly"
      },
      {
        id: uuid(),
        name: "Ben"
      }
    ];

    const NewProjectsUsers = [
      // Nathan is on Awesome Game
      { projectId: newProjects[0].id, userId: newUsers[0].id },
      // Nathan is on Design
      { projectId: newProjects[1].id, userId: newUsers[0].id },

      // Lilly is on Awesome Game
      { projectId: newProjects[0].id, userId: newUsers[1].id },

      // Ben is on Design
      { projectId: newProjects[1].id, userId: newUsers[2].id }
    ];

    await Users.create(newUsers);
    await Projects.create(newProjects);
    await ProjectsUsers.create(NewProjectsUsers);

    let users = await Users.include("projects").all();
    expect(users.length).toBe(3);
  });

  it("can load hasAndBelongsToMany relations with different keys", async () => {
    expect.hasAssertions();

    await createTable("users", "name:string");
    await createTable("memberships", "user_id:uuid", "project_id:uuid");
    await createTable("projects", "name:string");

    interface IUserModel extends IModel {
      name: string;
      project?: IProjectModel;
    }

    interface IProjectModel extends IModel {
      name: string;
      users?: IUserModel[];
    }

    interface IMembershipModel extends IModel {
      user_id: string;
      project_id: string;
    }

    const Users = database.model<IUserModel>("users", {
      relations: {
        projects: {
          hasAndBelongsToMany: "projects",
          through: "memberships",
          primaryKey: "user_id",
          foreignKey: "project_id"
        }
      }
    });
    const Projects = database.model<IUserModel>("projects", {
      relations: {
        users: {
          hasAndBelongsToMany: "users",
          through: "memberships",
          primaryKey: "project_id",
          foreignKey: "user_id"
        }
      }
    });
    const Memberships = database.model<IMembershipModel>("memberships");

    const newProjects = [
      {
        id: uuid(),
        name: "Awesome Game"
      },
      {
        id: uuid(),
        name: "Design"
      }
    ];

    const newUsers = [
      {
        id: uuid(),
        name: "Nathan"
      },
      {
        id: uuid(),
        name: "Lilly"
      },
      {
        id: uuid(),
        name: "Ben"
      }
    ];

    const new_memberships = [
      // Nathan is on Awesome Game
      { project_id: newProjects[0].id, user_id: newUsers[0].id },
      // Nathan is on Design
      { project_id: newProjects[1].id, user_id: newUsers[0].id },

      // Lilly is on Awesome Game
      { project_id: newProjects[0].id, user_id: newUsers[1].id },

      // Ben is on Design
      { project_id: newProjects[1].id, user_id: newUsers[2].id }
    ];

    await Users.create(newUsers);
    await Projects.create(newProjects);
    await Memberships.create(new_memberships);

    let users = await Users.include("projects").all();
    expect(users.length).toBe(3);
  });

  it("can save an object that has a hasOne relation on it", async () => {
    expect.hasAssertions();

    await createTable("users", "name:string");
    await createTable("profiles", "bio:string", "userId:uuid");

    interface IUserModel extends IModel {
      name?: string;
      profile?: IProfileModel;
    }

    interface IProfileModel extends IModel {
      bio: string;
      user?: IUserModel;
    }

    const Users = database.model<IUserModel>("users", {
      relations: {
        profile: { hasOne: "profile" }
      }
    });
    const Profiles = database.model<IProfileModel>("profiles", {
      relations: {
        user: { belongsTo: "user" }
      }
    });

    const initialProfile = {
      bio: "Working on Awesome Game"
    };

    const replacementProfile = {
      bio: "Working on Design"
    };

    const profileWithId = {
      id: uuid(),
      bio: "Working on Art"
    };

    const newUser = {
      name: "Nathan"
    };

    let user = await Users.create(newUser);

    // User has no profile to start with
    expect(typeof user.profile).toBe("undefined");

    // Give the user a profile
    user = await Users.save({ ...user, profile: initialProfile });
    expect(user.profile).toBeTruthy();
    let savedInitialProfile = await Profiles.where({ bio: initialProfile.bio })
      .include("user")
      .first();
    expect(user.profile.id).toBe(savedInitialProfile.id);
    expect(savedInitialProfile.user.id).toBe(user.id);

    // Change the profile to a different one
    user = await Users.save({ ...user, profile: replacementProfile });
    let otherProfile = await Profiles.where({ bio: replacementProfile.bio })
      .include("user")
      .first();
    expect(user.profile.id).toBe(otherProfile.id);
    expect(otherProfile.user.id).toBe(user.id);

    // Make sure that initial profile no longer has the user
    savedInitialProfile = await Profiles.include("user").find(savedInitialProfile.id);
    expect(savedInitialProfile.user).toBeFalsy();

    // Change the profile to one with that already has an ID
    user = await Users.save({ ...user, profile: profileWithId });
    expect(user.profile.id).toBe(profileWithId.id);

    // Add an already saved profile to the user
    let existingProfile = await Profiles.create(initialProfile);
    user = await Users.save({ ...user, profile: { ...existingProfile, bio: "Working on updates" } });

    expect(user.profile.id).toBe(existingProfile.id);
    expect(user.profile.bio).toBe("Working on updates");
  });

  it("can save an object that has hasAndBelongsToMany relations on it", async () => {
    expect.hasAssertions();

    await createTable("users", "name:string");
    await createTable("projects_users", "userId:uuid", "projectId:uuid");
    await createTable("projects", "name:string");

    interface IUserModel extends IModel {
      name?: string;
      projects?: IProjectModel[];
    }

    interface IProjectModel extends IModel {
      name?: string;
      users?: IUserModel[];
    }

    const Users = database.model<IUserModel>("users", {
      relations: {
        projects: { hasAndBelongsToMany: "projects" }
      }
    });
    const Projects = database.model<IProjectModel>("projects", {
      relations: {
        users: { hasAndBelongsToMany: "users" }
      }
    });
    const ProjectsUsers = database.model("projects_users");

    const newProjects = [
      {
        name: "Awesome Game"
      },
      {
        id: uuid(),
        name: "Design"
      }
    ];

    const persistedProject = {
      name: "Persisted"
    };

    const newUser = {
      name: "Nathan"
    };

    let project = await Projects.create(persistedProject);
    let user = await Users.create(newUser);

    // Add the first two unsaved projects
    user = await Users.save({ ...user, projects: newProjects });
    expect(user.projects.length).toBe(2);

    // Add the third, already saved project
    user = await Users.save({ ...user, projects: [...user.projects, project] });

    expect(user.projects.length).toBe(3);
    expect(user.projects.find(p => p.id === project.id)).not.toBeNull();

    let users = await Users.include("projects").all();

    expect(users[0].projects.length).toBe(3);

    project = users[0].projects.find(p => p.name === newProjects[0].name);

    expect(typeof project.id !== "undefined").toBeTruthy();

    // Make sure subsequent saves don't add duplicates
    user = await Users.save(users[0]);
    expect(user.projects.length).toBe(3);

    let projectsUsers = await ProjectsUsers.all();
    expect(projectsUsers.length).toBe(3);
  });

  it("can save an object that has hasMany relations on it", async () => {
    expect.hasAssertions();

    await createTable("users", "name:string");
    await createTable("projects", "name:string", "userId:uuid");

    interface IUserModel extends IModel {
      name?: string;
      projects?: IProjectModel[];
    }

    interface IProjectModel extends IModel {
      name?: string;
      userId?: string;
      user?: IUserModel;
    }

    const Users = database.model<IUserModel>("users", {
      relations: {
        projects: { hasMany: "projects" }
      }
    });
    const Projects = database.model<IProjectModel>("projects", {
      relations: {
        user: { belongsTo: "user" }
      }
    });

    const newProjects = [
      {
        name: "Awesome Game"
      },
      {
        id: uuid(),
        name: "Design"
      }
    ];

    const persistedProject = {
      name: "Persisted"
    };

    const newUser = {
      name: "Nathan"
    };

    let project = await Projects.create(persistedProject);
    let user = await Users.create(newUser);

    // Add the first two unsaved projects
    user = await Users.save({ ...user, projects: newProjects });
    expect(user.projects.length).toBe(2);

    // Add the third, already saved project
    user = await Users.save({ ...user, projects: [...user.projects, project] });
    expect(user.projects.length).toBe(3);
    expect(user.projects.find(p => p.id === project.id)).not.toBeNull();

    // Make sure we can retrieve the related projects
    let users = await Users.include("projects").all();
    expect(users[0].projects.length).toBe(3);

    // Make sure a related project is actually linked back to the user too
    project = users[0].projects.find(p => p.name === newProjects[0].name);
    expect(typeof project.id).not.toBe("undefined");

    project = await Projects.find(project.id);
    user = await Users.first();
    expect(project.userId).toBe(user.id);
  });

  it("can save an object that has hasMany relations on it and one of them also has a hasMany relation on it", async () => {
    expect.hasAssertions();

    await createTable("users", "name:string");
    await createTable("projects", "name:string", "userId:uuid");
    await createTable("lists", "name:string", "projectId:uuid");

    interface IUserModel extends IModel {
      name?: string;
      projects?: IProjectModel[];
    }

    interface IProjectModel extends IModel {
      name?: string;
      user?: IUserModel;
      lists?: IListModel[];
    }

    interface IListModel extends IModel {
      name?: string;
      project?: IProjectModel;
    }

    const Users = database.model<IUserModel>("users", {
      relations: {
        projects: { hasMany: "projects" }
      }
    });
    const Projects = database.model<IProjectModel>("projects", {
      relations: {
        user: { belongsTo: "user" },
        lists: { hasMany: "lists" }
      }
    });
    const Lists = database.model<IListModel>("lists", {
      relations: {
        project: { belongsTo: "projects" }
      }
    });

    const newUser = {
      name: "Nathan",
      projects: [
        {
          name: "Awesome Game"
        },
        {
          name: "Design",
          lists: [
            {
              name: "To Do"
            },
            {
              name: "Doing"
            },
            {
              name: "Done"
            }
          ]
        }
      ]
    };

    let user = await Users.create(newUser);
    let projects = user.projects;
    expect(projects.length).toBe(2);

    let projectWithLists = projects.find(p => typeof p.lists !== "undefined");
    expect(projectWithLists.lists.length).toBe(3);
    expect(projectWithLists.lists[0].name).toBe(newUser.projects[1].lists[0].name);

    let project = await Projects.include("lists").find(projectWithLists.id);
    expect(project.lists.length).toBe(3);

    let list = await Lists.find(project.lists[0].id);
    expect(list.id).toBe(project.lists[0].id);
  });

  it("can save an object that has a belongsTo relations on it", async () => {
    expect.hasAssertions();

    await createTable("users", "name:string");
    await createTable("projects", "name:string", "userId:uuid");

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
        user: { belongsTo: "user" }
      }
    });

    const newProject = {
      id: uuid(),
      name: "Awesome Game"
    };

    let initialUser: IUserModel = {
      name: "Nathan"
    };

    let replacementUser: IUserModel = {
      name: "Lilly"
    };

    let project = await Projects.create(newProject);
    // User is nothing initially
    expect(typeof project.user).toBe("undefined");

    project = await Projects.save({ ...project, user: initialUser });

    // User was persisted and attached to the project
    initialUser = await Users.where({ name: initialUser.name })
      .include("projects")
      .first();

    expect(project.user.id).toBe(initialUser.id);
    expect(initialUser.projects[0].id).toBe(project.id);

    project = await Projects.save({ ...project, user: replacementUser });
    replacementUser = await Users.where({ name: replacementUser.name })
      .include("projects")
      .first();
    expect(project.user.id).toBe(replacementUser.id);
    expect(replacementUser.projects[0].id).toBe(project.id);

    // Check that the initialUser projects is now empty
    initialUser = await Users.include("projects").find(initialUser.id);
    expect(initialUser.projects.length).toBe(0);

    project = await Projects.save({ ...project, user: null });
    replacementUser = await Users.where({ name: replacementUser.name })
      .include("projects")
      .first();
    expect(project.user).toBe(null);
    expect(replacementUser.projects.length).toBe(0);
  });

  it("can destroy dependent objects when destroying the parent", async () => {
    expect.hasAssertions();

    await createTable("users", "name:string");
    await createTable("projects", "name:string", "userId:uuid");
    await createTable("profiles", "bio:string", "userId:uuid");

    interface IUserModel extends IModel {
      name?: string;

      projects?: IProjectModel[];
      profile?: IProfileModel;
    }

    interface IProjectModel extends IModel {
      name?: string;
      userId?: string;

      user?: IUserModel;
    }

    interface IProfileModel extends IModel {
      bio?: string;
      userId?: string;

      user?: IUserModel;
    }

    const Users = database.model<IUserModel>("users", {
      relations: {
        projects: { hasMany: "projects", dependent: true },
        profile: { hasOne: "profile", dependent: true }
      }
    });
    const Projects = database.model<IProjectModel>("projects", {
      relations: {
        user: { belongsTo: "user" }
      }
    });
    const Profiles = database.model<IProfileModel>("profiles", {
      relations: {
        user: { belongsTo: "user" }
      }
    });

    const newProject = { id: uuid(), name: "Awesome Game" };
    const newUser = { name: "Nathan" };
    const newProfile = { bio: "Working on Awesome Game" };

    let project = await Projects.create(newProject);
    let profile = await Profiles.create(newProfile);
    let user = await Users.create(newUser);

    user = await Users.save({ ...user, projects: [project], profile });

    // Destroy the user (and the dependent project)
    user = await Users.destroy(user);
    project = await Projects.find(project.id);
    expect(project).toBeNull();
    profile = await Profiles.find(profile.id);
    expect(profile).toBeNull();
  });
});

async function createTable(tableName: string, ...columns: string[]) {
  await database.knex.schema.createTable(tableName, t => {
    t.uuid("id").primary();

    columns.forEach(column => {
      const [name, type] = column.split(":");
      t[type](name);
    });

    t.timestamp("createdAt");
    t.timestamp("updatedAt");
  });
}
