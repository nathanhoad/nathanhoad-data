require("dotenv").config();

import Knex from "knex";

import Model from "./Model";
import { IModel, ModelOptions } from "./types";

export default class Database {
  public knex: Knex;
  public isConnected: boolean;

  public models: { [tableName: string]: Model<any> };

  /**
   * Instanciate a new database
   * @param connectionOrKnex
   */
  constructor(connectionOrKnex?: string | Knex | boolean) {
    this.models = {};
    this.knex = null;

    // Auto connect unless we are explicitly told not to
    if (connectionOrKnex !== false) {
      this.connect(connectionOrKnex as string | Knex);
    }
  }

  /**
   * Connect to the database
   * @param connectionURL
   */
  public connect(connectionOrKnex?: string | Knex) {
    if (this.isConnected) return;

    if (typeof connectionOrKnex === "string" || typeof connectionOrKnex === "undefined") {
      const connection =
        connectionOrKnex || process.env.NODE_ENV == "test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

      this.knex = Knex({
        client: "pg",
        connection
      });
    } else {
      this.knex = connectionOrKnex;
    }

    this.isConnected = !!this.knex;
  }

  /**
   * Disconnect from the database
   */
  public async disconnect() {
    if (!this.isConnected) return;

    await this.knex.destroy();
    this.knex = null;
    this.isConnected = false;
  }

  /**
   * Register a new model
   * @param tableName
   * @param options
   */
  public model<T extends IModel>(tableName: string, options?: ModelOptions<T>) {
    if (!this.models[tableName]) {
      this.models[tableName] = new Model<T>({
        ...options,
        database: this,
        tableName
      });
    }

    return this.models[tableName] as Model<T>;
  }

  /**
   * Wrap actions in a transaction
   * @param handler
   */
  public transaction(handler: (t: Knex.Transaction) => Promise<any> | void) {
    return this.knex.transaction(handler);
  }
}
