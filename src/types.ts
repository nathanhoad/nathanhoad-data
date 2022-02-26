import Database from "./Database";
import { Knex } from "knex";

export type TableSchema = { [column: string]: Knex.ColumnInfo };

export interface IModel {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ModelOptions<T> {
  database?: Database;
  tableName?: string;
  defaultScope?: Knex.QueryBuilder;

  relations?: { [name: string]: RelationDefinition };
  hooks?: { [name: string]: Hook<T> };
  contexts?: { [name: string]: Context<T> };

  availableRelations?: { [name: string]: RelationDefinition };
  includedRelations?: string[];
}

export interface QueryOptions {
  tableName?: string;
  transaction?: Knex.Transaction;
  exists?: boolean;
  updatedAt?: Date;
  skipHooks?: boolean;
}

export enum RelationTypes {
  hasMany,
  belongsTo,
  hasAndBelongsToMany,
  hasOne
}

export interface RelationDefinition {
  name?: string;
  tableName?: string;
  type?: RelationTypes;
  key?: string;
  throughTable?: string;
  sourceKey?: string;

  many?: boolean;

  hasAndBelongsToMany?: string;
  belongsTo?: string;
  hasMany?: string;
  hasOne?: string;
  dependent?: boolean;
  through?: string;
  primaryKey?: string;
  foreignKey?: string;
  table?: string;
}

export interface SavedRelation<T> {
  name: string;
  value: any;
  belongsToKey?: string;
  belongsToValue?: string;
}

export class RelationError extends Error {}

export type Hook<T> = (object: T, options?: QueryOptions) => Promise<T> | T | Promise<void> | void;

export type Context<T> = string | string[] | ContextFunction<T>;

export type ContextFunction<T> = (object: T) => { [key: string]: any };

export class ContextError extends Error {}
