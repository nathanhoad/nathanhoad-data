import { Knex } from "knex";
import i from "i";
import {
  IModel,
  ModelOptions,
  RelationTypes,
  QueryOptions,
  ContextFunction,
  RelationDefinition,
  SavedRelation,
  RelationError,
  ContextError,
  TableSchema
} from "./types";
import { uuid } from "./util";

const Inflect = i();

export default class Model<T extends IModel> {
  public options: ModelOptions<T>;

  private cachedSchema: TableSchema = null;

  constructor(options: ModelOptions<T>) {
    this.options = options;

    // Set up relations
    const { tableName } = this.options;
    Object.keys(this.options.relations || []).forEach((relationName: string) => {
      const relation = this.options.relations[relationName];

      relation.name = relationName;

      if (relation.hasAndBelongsToMany) {
        relation.many = true;
        relation.type = RelationTypes.hasAndBelongsToMany;
        // through table name will generally be a combination of the two tables (alpha sorted)
        relation.throughTable = relation.through || [tableName, Inflect.pluralize(relationName)].sort().join("_");
        relation.tableName = relation.table || Inflect.pluralize(relationName);
        relation.sourceKey = relation.primaryKey || `${Inflect.singularize(tableName)}Id`;
        relation.key = relation.foreignKey || `${Inflect.singularize(relationName)}Id`;
        relation.dependent = false;
      } else if (relation.belongsTo) {
        relation.many = false;
        relation.type = RelationTypes.belongsTo;
        relation.tableName = relation.table || Inflect.pluralize(relation.belongsTo);
        relation.key = relation.foreignKey || `${Inflect.singularize(relationName)}Id`;
        relation.dependent = false;
      } else if (relation.hasMany) {
        relation.many = true;
        relation.type = RelationTypes.hasMany;
        relation.tableName = relation.table || Inflect.pluralize(relation.hasMany);
        relation.key = relation.foreignKey || `${Inflect.singularize(tableName)}Id`;
        relation.dependent = relation.dependent === true;
      } else if (relation.hasOne) {
        relation.many = false;
        relation.type = RelationTypes.hasOne;
        relation.tableName = relation.table || Inflect.pluralize(relation.hasOne);
        relation.key = relation.foreignKey || `${Inflect.singularize(tableName)}Id`;
        relation.dependent = relation.dependent === true;
      } else {
        // Using typescript wants you against any unknown relation types
        /* istanbul ignore next */
        throw new RelationError(`Unknown relation type for "${relation.name}"`);
      }

      this.options.availableRelations = this.options.availableRelations || {};
      this.options.availableRelations[relationName] = relation;
    });
  }

  /**
   * Get the current knex connection
   * @param options
   */
  public knex(options: QueryOptions = {}) {
    const { database, tableName } = this.options;

    if (options.transaction) {
      return database.knex(options.tableName || tableName).transacting(options.transaction);
    } else {
      return database.knex(options.tableName || tableName);
    }
  }

  /**
   * Get the schema for this table
   */
  public async schema(): Promise<TableSchema> {
    if (!this.cachedSchema) {
      // NOTE: the type provided by Knex for ColumnInfo is wrong
      // for when you don't provide the optional column argument
      this.cachedSchema = ((await this.knex().columnInfo()) as any) as TableSchema;
    }

    return this.cachedSchema;
  }

  /**
   * Start a new query chain
   */

  public query(): Knex.QueryBuilder {
    const { database, tableName } = this.options;

    if (this.options.defaultScope) {
      return this.options.defaultScope;
    }

    return database.knex(tableName);
  }

  /**
   * Persist a new model (alias of `save()`)
   * @param object
   * @param options
   */
  public async create(object: T, options?: QueryOptions): Promise<T>;
  public async create(object: T[], options?: QueryOptions): Promise<T[]>;
  public async create(object: T | T[], options: QueryOptions = {}): Promise<T | T[]> {
    // options.exists = false;

    if (object instanceof Array) {
      return Promise.all(object.map((o: T) => this.save(o, options))) as Promise<T[]>;
    }

    return this.save(object, options);
  }

  /**
   * Destroy an instance
   * @param object
   * @param options
   */
  public async destroy(object: T, options?: QueryOptions): Promise<T>;
  public async destroy(object: T[], options?: QueryOptions): Promise<T[]>;
  public async destroy(object, options: QueryOptions = {}): Promise<T | T[]> {
    if (object instanceof Array) {
      return Promise.all(object.map((o: T) => this.destroy(o as T, options))) as Promise<T[]>;
    }

    // beforeDestroy hook can cancel the destroy
    if (!options.skipHooks) {
      try {
        await this.runHook("beforeDestroy", object);
      } catch (err) {
        return object;
      }
    }

    await this.knex({ ...options })
      .where({ id: object.id })
      .del();

    // Check over dependent hasMany (and hasAndBelongsToMany join) relations
    const dependentRelations = Object.keys(this.options.availableRelations || {})
      .map(k => this.options.availableRelations[k])
      .filter(r => r.dependent || r.type === RelationTypes.hasAndBelongsToMany);

    if (dependentRelations.length > 0) {
      await Promise.all(
        dependentRelations.map(dr => {
          // if hasAndBelongsToMany then remove rows from the join table
          const tableName = dr.type === RelationTypes.hasAndBelongsToMany ? dr.throughTable : dr.tableName;
          const key = dr.type === RelationTypes.hasAndBelongsToMany ? dr.sourceKey : dr.key;

          return this.knex({ ...options, tableName })
            .where(key, object.id)
            .del();
        })
      );
    }

    if (!options.skipHooks) {
      this.runHook("afterDestroy", object);
    }

    return object;
  }

  /**
   * Persist an instance
   * @param object
   * @param options
   */
  public async save(object: T, options?: QueryOptions): Promise<T>;
  public async save(object: T[], options?: QueryOptions): Promise<T[]>;
  public async save(object: T | T[], options: QueryOptions = {}): Promise<T | T[]> {
    if (object instanceof Array) {
      return Promise.all(object.map((o: T) => this.save(o as T, options))) as Promise<T[]>;
    }

    // Shallow copy the object so we can remove some keys from it
    let savingObject = { ...object };

    // Detach relations because they can't be saved against this record
    const { availableRelations } = this.options;
    // Work out which fields in the given object need updating
    const includedRelations = Object.keys(savingObject).filter((key: string) =>
      Object.keys(availableRelations || []).includes(key)
    );

    const relations = {};
    includedRelations.forEach((key: string) => {
      relations[key] = savingObject[key];
      delete savingObject[key];
    });

    // Make sure ID is set
    if (typeof savingObject.id === "undefined") {
      savingObject.id = uuid();
    }

    Object.keys(savingObject).forEach(key => {
      // Convert any json properties to stringified json
      if (typeof savingObject[key] === "object") {
        savingObject[key] = JSON.stringify(savingObject[key]);
      }
      // Also set any 'null' strings to actual null
      if (savingObject[key] === "null") {
        savingObject[key] = null;
      }
    });

    // Cache 'now' so all our saves are at the same time
    options = { ...options, updatedAt: new Date() };
    savingObject.updatedAt = options.updatedAt;

    // Check to see if the record has already been persisted
    const exists =
      typeof options.exists === "boolean"
        ? options.exists
        : await this.knex(options)
          .where({ id: savingObject.id })
          .then((rows: any) => rows.length > 0);

    // Before hooks can cancel a save
    if (!options.skipHooks) {
      try {
        if (!exists) {
          await this.runHook("beforeCreate", savingObject);
        }
        await this.runHook("beforeSave", savingObject as T, { exists });
      } catch (err) {
        // Give them back their original object
        return object;
      }
    }

    // Do the actual saving
    let results: any;
    if (exists) {
      results = await this.knex(options)
        .where({ id: savingObject.id })
        .update(savingObject, "*");
    } else {
      savingObject.createdAt = options.updatedAt;
      results = await this.knex(options).insert(savingObject, "*");
    }
    savingObject = { ...results[0] };

    // Reattach the relations that we removed before
    Object.keys(relations).forEach((key: string) => {
      savingObject[key] = relations[key];
    });
    savingObject = await this.saveRelations(savingObject as T, options);

    // run the after hooks
    if (!options.skipHooks) {
      await this.runHook("afterSave", savingObject, { exists });
      if (!exists) {
        await this.runHook("afterCreate", savingObject);
      }
    }

    return savingObject;
  }

  /**
   * Find a record by ID
   * @param id
   * @param options
   */
  public find(id: string, options: QueryOptions = {}) {
    return this.where({ id }).first(options);
  }

  /**
   * Add a WHERE clause
   * @param where
   * @param operator optional
   * @param value optional
   */
  public where(where: { [column: string]: any } | string, operator?: string, value?: any) {
    let query = this.query().clone();

    if (!operator) {
      query = query.where(where);
    } else {
      query = query.where(where as string, operator, value);
    }

    return this.chain(query);
  }

  /**
   * Add a WHERE IN clause
   * @param column
   * @param values
   */
  public whereIn(column: string, values: any[]) {
    const query = this.query()
      .clone()
      .whereIn(column, values);
    return this.chain(query);
  }

  /**
   * Add a WHERE NOT IN clause
   * @param column
   * @param values
   */
  public whereNotIn(column: string, values: any[]) {
    const query = this.query()
      .clone()
      .whereNotIn(column, values);
    return this.chain(query);
  }

  /**
   * Add a WHERE NULL clause
   * @param column
   */
  public whereNull(column: string) {
    const query = this.query()
      .clone()
      .whereNull(column);
    return this.chain(query);
  }

  /**
   * Add a WHERE NOT NULL clause
   * @param column
   */
  public whereNotNull(column: string) {
    const query = this.query()
      .clone()
      .whereNotNull(column);
    return this.chain(query);
  }

  /**
   * Add a WHERE clause for partial matching JSONB values
   * @param column A JSONB column
   * @param value A partial object matching the JSONB column
   */
  public whereJSONBContains(column: string, value: any) {
    return this.where(column, "@>", JSON.stringify([value]));
  }

  /**
   * Include relations
   * @param includedRelations
   */
  public include(...includedRelations: string[]) {
    const query = this.query().clone();
    return this.chain(query, { includedRelations });
  }

  /**
   * Execute the query and return the first result
   * @param options
   */
  public async first(options: QueryOptions = {}): Promise<T> {
    let query = this.query().clone();

    if (options.transaction) {
      query = query.transacting(options.transaction);
    }

    let results: any[] = await query.limit(1);

    if (results.length === 0) return null;

    results = await this.includeRelations(results, options);

    return { ...results[0] };
  }

  /**
   * Execute the query and return all results
   * @param options
   */
  public async all(options: QueryOptions = {}): Promise<T[]> {
    let query = this.query().clone();

    if (options.transaction) {
      query = query.transacting(options.transaction);
    }

    let results = (await query).map((r: any) => ({ ...r }));
    results = await this.includeRelations(results, options);

    return results;
  }

  /**
   * Count records
   * @param options
   */
  public async count(options: QueryOptions = {}): Promise<number> {
    let query = this.query().clone();

    if (options.transaction) {
      query = query.transacting(options.transaction);
    }

    let result = await query.count("*");
    return parseInt(result[0].count, 10);
  }

  /**
   * Execute a delete query
   * NOTE: this will not respect { depdendent: true } or any model hooks
   * @param options
   */
  public async bulkDestroy(options: QueryOptions = {}) {
    let query = this.query().clone();

    if (options.transaction) {
      query = query.transacting(options.transaction);
    }

    return query.del();
  }

  /**
   * Limit the number of results to pages
   * @param n
   * @param perPage
   */
  public page(page: number, perPage: number = 20) {
    let query = this.query()
      .clone()
      .limit(perPage)
      .offset((page - 1) * perPage);
    return this.chain(query);
  }

  /**
   * Order the results
   * @param column
   * @param direction
   */
  public order(column: string, direction: "ASC" | "DESC" = "ASC") {
    let query = this.query()
      .clone()
      .orderBy(column, direction);
    return this.chain(query);
  }

  /**
   * Convert the query to a string
   */
  public toString() {
    return this.query().toString();
  }

  /**
   * Filter the result objects for a given context
   * @param results
   * @param context optional context name or function
   */
  public withContext(results: T | T[], context: string | string[] | ContextFunction<T> = "default"): any {
    if (results instanceof Array) {
      return results.map((r: T) => this.withContext(r, context));
    }

    // In case we need to pass it to a relation
    let contextName: string;

    // Use the default if that exists
    if (context === "default") {
      if (typeof this.options.contexts === "undefined") return results;
      if (typeof this.options.contexts.default === "undefined") return results;

      contextName = "default";
      context = this.options.contexts.default;
    }

    if (typeof context === "string") {
      // Make sure its defined
      if (typeof this.options.contexts === "undefined") throw new ContextError("There are no contexts defined.");
      if (typeof this.options.contexts[context] === "undefined")
        throw new ContextError(`There is no context called "${context}"`);

      contextName = context;
      context = this.options.contexts[context];
    }

    let object = results as T;
    if (context instanceof Function) {
      return context({ ...object });
    }

    if (context instanceof Array && context.length > 0 && context[0] !== "*") {
      let newObject: any = {};
      context.forEach((key: string) => {
        if (!object[key]) return null;

        if (Object.keys(this.options.availableRelations || []).includes(key)) {
          const { database } = this.options;
          const RelatedModel = database.model(this.options.availableRelations[key].tableName);
          const relatedContext = RelatedModel.options.contexts && RelatedModel.options.contexts[contextName];
          newObject[key] = RelatedModel.withContext(results[key], relatedContext || "default");
        } else {
          newObject[key] = results[key];
        }
      });
      return newObject;
    }

    return object;
  }

  /**
   * Chain clauses for a query
   * @param query
   * @param options
   */
  private chain(query: any, options?: ModelOptions<T>) {
    return new Model<T>({
      ...this.options,
      ...options,
      defaultScope: query
    });
  }

  /**
   * Run a hook over the object
   * @param hookName
   * @param object
   */
  private async runHook(hookName: string, object: T, options: QueryOptions = {}): Promise<void> {
    if (!this.options.hooks) return;

    const hook = this.options.hooks[hookName];

    if (typeof hook !== "function") return;

    // Let hook throw, before hooks can cancel a save
    await hook(object, options);
  }

  private async saveRelations(object: T, options: QueryOptions = {}): Promise<T> {
    const { availableRelations } = this.options;

    if (!availableRelations || Object.values(availableRelations).length === 0) return object;

    const relationProperties = Object.keys(object).filter((key: string) =>
      Object.keys(availableRelations).includes(key)
    );

    let savedRelations = await Promise.all(
      relationProperties.map((key: string) => {
        const relation = availableRelations[key];
        const value = object[key];

        if (typeof relation === "undefined") throw new RelationError(`There is no relation for "${key}."`);

        switch (relation.type) {
          case RelationTypes.hasMany:
            return this.saveHasManyRelation(object, relation, value, options);

          case RelationTypes.belongsTo:
            return this.saveBelongsToRelation(object, relation, value, options);

          case RelationTypes.hasAndBelongsToMany:
            return this.saveHasAndBelongsToManyRelation(object, relation, value, options);

          case RelationTypes.hasOne:
            return this.saveHasOneRelation(object, relation, value, options);
        }
      })
    );

    savedRelations.forEach((savedRelation: SavedRelation<T>) => {
      if (!savedRelations) return;

      object[savedRelation.name] = savedRelation.value;

      if (savedRelation.belongsToKey) {
        object[savedRelation.belongsToKey] = savedRelation.belongsToValue;
      }
    });

    return object;
  }

  private async saveHasManyRelation(
    object: T,
    relation: RelationDefinition,
    relatedObjects: IModel[],
    options: QueryOptions
  ): Promise<SavedRelation<T>> {
    const RelatedModel = this.options.database.model(relation.tableName);

    const newRelatedObjectIds = relatedObjects
      .map((r: any) => r.id)
      .filter((id: string) => id && typeof id !== "undefined");

    // Unset any objects that have this model as their relation id
    await this.knex({ ...options, tableName: relation.tableName })
      .where(relation.key, object.id)
      .whereNotIn("id", newRelatedObjectIds)
      .update({ [relation.key]: null });

    // Find any related objects that are already persisted
    const existingRelatedObjectIds = await this.knex({ ...options, tableName: relation.tableName })
      .select("id")
      .whereIn("id", newRelatedObjectIds)
      .then((results: any) => results.map((result: any) => result.id));

    const savedRelatedObjects = await Promise.all(
      relatedObjects.map((relatedObject: any) => {
        relatedObject[relation.key] = object.id;
        // Save/update the related object (which will then save further relations)
        return RelatedModel.save(relatedObject, {
          ...options,
          exists: existingRelatedObjectIds.includes(relatedObject.id)
        });
      })
    );

    return {
      name: relation.name,
      value: savedRelatedObjects
    };
  }

  private async saveBelongsToRelation(
    object: T,
    relation: RelationDefinition,
    relatedObject: IModel,
    options: QueryOptions
  ): Promise<SavedRelation<T>> {
    const RelatedModel = this.options.database.model(relation.tableName);

    let foriegnValue;

    if (relatedObject) {
      foriegnValue = await RelatedModel.save(relatedObject, options);
    } else {
      foriegnValue = null;
    }

    const foreignId = foriegnValue ? foriegnValue.id : null;

    // Update this model to point to the related object
    await this.knex(options)
      .where({ id: object.id })
      .update({ [relation.key]: foreignId });

    return {
      name: relation.name,
      value: foriegnValue,
      // Include some information to update the parent model
      belongsToKey: relation.key,
      belongsToValue: foreignId
    };
  }

  private async saveHasAndBelongsToManyRelation(
    object: T,
    relation: RelationDefinition,
    relatedObjects: IModel[],
    options: QueryOptions
  ): Promise<SavedRelation<T>> {
    const RelatedModel = this.options.database.model(relation.tableName);

    // eg. Users.save(user) where user.has('projects')
    // relation_ids would be project_ids
    const newRelatedObjectIds = relatedObjects.map(r => r.id).filter(id => id && typeof id !== "undefined");
    // Find any join rows that already exist so that we don't create them again
    // eg. projects_users records for this user
    const existingRelatedObjectIds = (
      await this.knex({ ...options, tableName: relation.throughTable })
        .select(relation.key)
        .where(relation.sourceKey, object.id)
    ).map(r => r[relation.key]);

    // Delete any join rows that have been removed
    // eg. remove any projects_users the are no long attached to the user
    await this.knex({ ...options, tableName: relation.throughTable })
      .where(relation.sourceKey, object.id)
      .whereNotIn(relation.key, newRelatedObjectIds)
      .del();

    // Work out which related rows already exist
    // eg. which projects already exist
    const existingRelatedIds = (
      await this.knex({ ...options, tableName: relation.tableName })
        .select("id")
        .whereIn("id", newRelatedObjectIds)
    ).map(r => r.id);

    // For each related thing create it if it doesn't exist and create a join record if it doesn't exist
    // eg. for each project, create it if it doesn't exist and create a projects_users for it if that doesn't exist
    const savedRelatedObjects = await Promise.all(
      relatedObjects.map(async relatedObject => {
        // create the relatedObject first so that we have an id for the join row
        relatedObject = await RelatedModel.save(relatedObject, {
          ...options,
          exists: existingRelatedIds.includes(relatedObject.id)
        });

        // See if we need to insert a new join row
        if (!existingRelatedObjectIds.includes(relatedObject.id)) {
          const newJoinRow: any = {
            id: uuid(),
            [relation.key]: relatedObject.id,
            [relation.sourceKey]: object.id,
            createdAt: options.updatedAt,
            updatedAt: options.updatedAt
          };

          await this.knex({ ...options, tableName: relation.throughTable }).insert(newJoinRow, "id");
        }

        return relatedObject;
      })
    );

    return {
      name: relation.name,
      value: savedRelatedObjects
    };
  }

  private async saveHasOneRelation(
    object: T,
    relation: RelationDefinition,
    relatedObject: IModel,
    options: QueryOptions
  ) {
    const RelatedModel = this.options.database.model(relation.tableName);

    // Ensure our related object has an id (even if its not persisted yet)
    relatedObject.id = relatedObject.id || uuid();

    // Unset any other related object that points to this object
    await this.knex({ ...options, tableName: relation.tableName })
      .where(relation.key, object.id)
      .whereNot("id", relatedObject.id)
      .update({ [relation.key]: null });

    const existingRelatedIds = await this.knex({ ...options, tableName: relation.tableName })
      .select("id")
      .where("id", relatedObject.id)
      .then((results: any) => results.map((result: any) => result.id));

    let savedRelatedObject = null;
    if (relatedObject) {
      relatedObject[relation.key] = object.id;
      // save/update the related object (which will then in turn save any relations on itself)
      savedRelatedObject = await RelatedModel.save(relatedObject, {
        ...options,
        exists: existingRelatedIds.includes(relatedObject.id)
      });
    }

    return {
      name: relation.name,
      value: savedRelatedObject
    };
  }

  private async includeRelations(results: any, options: QueryOptions = {}): Promise<T[]> {
    if (results.length === 0) return results;

    const { database, includedRelations, availableRelations } = this.options;

    if (!includedRelations || includedRelations.length === 0) return results;

    const ids = results.map((r: any) => r.id);
    const relations = await Promise.all(
      includedRelations.map(async (relationName: string) => {
        const relation = availableRelations[relationName];
        const model = database.model(relation.tableName);

        // If there is no relation with that name then error
        if (typeof relation === "undefined") throw new RelationError(`There is no "${relationName}" relation`);

        if (relation.type === RelationTypes.hasMany) {
          const relatedRows = (
            await this.knex({ ...options, tableName: relation.tableName })
              .select("*")
              .whereIn(relation.key, ids)
          ).map((r: any) => ({ ...r }));
          return {
            name: relationName,
            properties: relation,
            rows: relatedRows,
            model
          };
        } else if (relation.type === RelationTypes.hasAndBelongsToMany) {
          // eg.
          // User has many Projects (through users_projects)
          // Project has many Users (through users_projects)
          let throughIds = await this.knex({ ...options, tableName: relation.throughTable })
            .select(relation.sourceKey, relation.key)
            .whereIn(relation.sourceKey, ids);
          let joins = throughIds.map((r: any) => ({ ...r }));
          throughIds = throughIds.map(r => r[relation.key]);
          const relatedRows = (
            await this.knex({ ...options, tableName: relation.tableName })
              .select("*")
              .whereIn("id", throughIds)
          ).map((r: any) => ({ ...r }));
          return {
            name: relationName,
            properties: relation,
            joins: joins,
            rows: relatedRows,
            model
          };
        } else if (relation.type === RelationTypes.hasOne) {
          // Not sure when this would ever be used
          const relatedRows = (
            await this.knex({ ...options, tableName: relation.tableName })
              .select("*")
              .whereIn(relation.key, ids)
          ).map((r: any) => ({ ...r }));
          return {
            name: relationName,
            properties: relation,
            rows: relatedRows,
            model
          };
        } else if (relation.type === RelationTypes.belongsTo) {
          // eg.
          // User belongs to Department
          // Project belongs to User (eg. created_by_user_id)
          const relationIds = results.map((r: any) => r[relation.key]);
          const relatedRows = (
            await this.knex({ ...options, tableName: relation.tableName })
              .select("*")
              .whereIn("id", relationIds)
          ).map(r => Object.assign({}, r));
          return { name: relationName, properties: relation, rows: relatedRows, model: model };
        }
      })
    );

    // Graft the relations onto the matching results
    return results.map((result: any) => {
      relations.forEach(relation => {
        switch (relation.properties.type) {
          case RelationTypes.belongsTo:
            result[relation.name] = relation.rows.find(r => r.id === result[relation.properties.key]);
            break;

          case RelationTypes.hasMany:
            result[relation.name] = relation.rows.filter(r => r[relation.properties.key] === result.id);
            break;

          case RelationTypes.hasOne:
            result[relation.name] = relation.rows.find(r => r[relation.properties.key] === result.id);
            break;

          case RelationTypes.hasAndBelongsToMany:
            // Make a list of rows that match up with the result
            const joinIds = relation.joins
              ? relation.joins
                .filter(j => j[relation.properties.sourceKey] == result.id)
                .map(j => j[relation.properties.key])
              : [];
            result[relation.name] = relation.rows.filter(r => joinIds.includes(r.id));
            break;
        }
      });
      return result;
    });
  }
}
