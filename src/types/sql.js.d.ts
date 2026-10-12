declare module "sql.js" {
  export type SqlValue = number | string | Uint8Array | null;

  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  export interface Statement {
    step(): boolean;
    get(): SqlValue[];
    getColumnNames(): string[];
    getSQL(): string;
    free(): boolean;
  }

  export interface StatementIterator extends Iterable<Statement> {
    getRemainingSQL(): string;
  }

  export interface Database {
    exec(sql: string): QueryExecResult[];
    run(sql: string): Database;
    prepare(sql: string): Statement;
    iterateStatements(sql: string): StatementIterator;
    create_function(
      name: string,
      func: (...args: SqlValue[]) => SqlValue | boolean | undefined
    ): Database;
    getRowsModified(): number;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export interface InitSqlJsOptions {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(
    options?: InitSqlJsOptions
  ): Promise<SqlJsStatic>;
}
