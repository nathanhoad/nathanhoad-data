# @nathanhoad/data

A small ORM that uses Typescript and plain objects.

Model instances have no fancy database methods. All querying is done statically from the model's class.

`npm i @nathanhoad/data`

## Migration CLI

### Generating migrations

`npx data migration <migration-name>`

For example, `npx data migration create-things` will create a migration file that creates the table `things` with an `id`, `createdAt`, and `updatedAt` fields. Add in any other fields and indices that you need but those three fields are the minimum for models to function correctly.

Using something like `npx data migration add-name-to-things` will create a migration that adds a `name` field to `things`. You can add multipled fields with something like `add-this-and-that-to-things`. It will try its best to guess what you mean but doesn't always get it right.

### Running migrations

Run any pending migrations with:

`npx data up`

And rollback the last migration group:

`npx data down`

To list all migrations, both pending and completed, run:

`npx data list`

### Schema

Get the schema for all tables or just one:

`npx data schema [table]`

To get the basic types for a table:

`npx data types [table]`

## Models

The easiest init is:

```ts
import data from "@nathanhoad/data";
```

`data` is a function that returns a connected instance of `Database`.

It assumes that `process.env.DATABASE_URL` or `process.env.TEST_DATABASE_URL` is set.

If you want to manually connect you can create your own wrapper:

```ts
import { Database } from '@nathanhoad/data';

// tell the database to not connect automatically
const database = new Database(false);
// connect accepts a connection string or a knex object
database.connect(process.env.DATABASE_URL);
export database;
```

A bigger example:

```ts
import data from "@nathanhoad/data";

import { IProjectModel } from "./Projects";
import { IShirtModel } from "./Shirts";

export interface IUserModel {
  id?: string;
  firstName?: string;
  lastName?: string;
  slug?: string;
  createdAt?: Date;
  updatedAt?: Date;

  projects?: Array<IProjectModel>;
  department?: IDepartmentModel;
  shirts?: Array<IShirtModel>;
}

export default data().model<IUserModel>("users", {
  hooks: {
    beforeCreate(user) {
      user.slug = slugify(`${user.firstName} ${user.lastName}`, 6);
    }
  },
  relations: {
    projects: { hasAndBelongsToMany: "projects" },
    department: { belongsTo: "department" }, // assumes departmentId
    shirts: { hasMany: "shirts", dependent: true } // deleting this user will delete all of their shirts
  },
  contexts: {
    simple: ["id", "fullName"], // only these fields are included in the resulting object
    derived(user) {
      // Add and remove properties to be sent
      user.activeFor = new Date() - user.createdAt;
      delete user.createdAt;
      delete user.updatedAt;
      return user;
    }
  }
});
```

### Hooks

Models expose a few hooks to help you manage the data going into the database.

Those hooks are (and generally called in this order):

- `beforeCreate` - Called before a model is created.
- `beforeSave` - Called before a model is saved (including just before it is created)
- `afterSave` - Called just after a model is saved (including just after it was created)
- `afterCreate` - Called just after a model is created
- `beforeDestroy` - Called just before a model is deleted
- `afterDestroy` - Called just after a model is deleted

Hooks are just functions and take the model (minus any relations) as the first argument.

```ts
const Things = data().model<IThingModel>("users", {
  hooks: {
    beforeCreate(user) {
      user.slug = slugify(`${user.firstName} ${user.lastName}`, 6);
    }
  }
});
```

You can also return a promise:

```ts
const Things = data().model<IThingModel>("users", {
  hooks: {
    async beforeCreate(user) {
      user.slug = await getSomeValue();
    }
  }
});
```

#### `id`, `createdAt` and `updatedAt`

All models are assumed to have `id`, `createdAt`, and `updatedAt` defined on them in the database.

### Creating

`.create()` is just an alias for `.save()`.

```ts
const Users = data().model<IUserModel>("users");

Users.create({ firstName "Nathan" }).then(user => {
  user.firstName; // => Nathan
});

Users.create([{ firstName "Nathan" }, { firstName "Lilly" }]).then(users => {
  users.length; // => 2
});
```

### Finding

```ts
Users.where({ email: "test@test.com" })
  .first()
  .then(user => {
    // user is an instance of Immutable.Map
    user.firstName = "Test";

    Users.save(user).then(updatedUser => {
      user.get("name");
    });
  });

Users.find("167a6f71-4e0f-4fb4-b2e8-a6dd2f5d087e").then(user => {
  user.id; // 167a6f71-4e0f-4fb4-b2e8-a6dd2f5d087e
});

Users.all().then(users => {
  Users.withContext(users);
});
```

### Saving

```ts
user.firstName = "Nathan";
Users.save(user).then(user => {
  user.updatedAt; // Just then
});
```

Saving a model that has `relations` attached will also attempt to save the attached related rows.

### Destroying

```ts
Users.destroy(user).then(user => {
  // user is the user that was just destroyed
});
```

Any dependent related records will also be destroyed (see down further in Associations/Relations).

## Applying context

Models can be converted to generic objects (for example, as the final step of an API endpoing response) by given an array of fields or providing a context mapper function.

Contexts are defined on the model:

```ts
const Users = data().model<IUserModel>("users", {
  contexts: {
    simple: ["id", "fullName"], // only these fields are included in the resulting object
    derived(user) {
      // Add and remove properties to be sent
      user.activeFor = new Date() - user.createdAt;
      delete user.createdAt;
      delete user.updatedAt;
      return user;
    }
  }
});

// Arrays
Users.withContext(users); // "default" context will just return the object unless defined
Users.withContext(users, "simple");
Users.withContext(users, "derived");
Users.withContext(users);

// Single objects
Users.withContext(user);
Users.withContext(user, "simple");
Users.withContext(user, "derived");
```

## Relations/Associations

Define `relations` on the collection:

```ts
const Users = data().model<IUserModel>("users", {
  relations: {
    projects: { hasAndBelongsToMany: "projects" },
    department: { belongsTo: "department" }, // assumes departmentId unless otherwise specified
    shirts: { hasMany: "shirts", dependent: true } // deleting this user will delete all of their shirts
  }
});
```

Set them on a model and save them. Anything that hasn't already been saved will be saved.

```ts
let newProject = {
  name: "Some cool project"
};

let newUser = {
  name: "Nathan",
  projects: [new_project]
};

Users.create(newUser).then(user => {
  user.projects; // array containing saved newProject
});
```

And then retrieve them.

```ts
Users.include("projects")
  .all()
  .then(users => {
    users[0].projects; // array of projects
  });
```

You can specify the key fields and table if needed:

```ts
const Users = data().model<IUserModel>("users", {
  relations: {
    projects: {
      hasAndBelongsToMany: "projects",
      through: "project_people",
      primaryKey: "user_id",
      foreignKey: "project_id"
    },
    department: { belongsTo: "department", foreignKey: "department_id", table: "department" },
    shirts: { has_many: "shirts", dependent: true, foreignKey: "user_id" }
  }
});
```

## Transactions

To wrap your actions inside a transaction just call:

```ts
import data from "@nathanhoad/data";

const Users = data().model<IUserModel>("users");
const Hats = data().model<IHatModel>("hats");

data()
  .transaction(async transaction => {
    const user = await Users.create({ firstName: "Nathan" }, { transaction });
    const hat = await Hats.create({ type: "Cowboy" }, { transaction });
  })
  .then(() => {
    // User and Hat are both committed to the database now
  })
  .catch(err => {
    // Something failed and both User and Hat are now rolled back
  });
```

## Contributors

- Nathan Hoad - [nathan@nathanhoad.net](mailto:nathan@nathanhoad.net)
