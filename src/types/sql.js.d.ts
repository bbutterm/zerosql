declare module "sql.js" {
  export type SqlValue = number | string | Uint8Array | null;

  /** Параметры подготовленного запроса: позиционные (?) или именованные (:name, $name, @name) */
  export type BindParams = SqlValue[] | Record<string, SqlValue> | null;

  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  export interface Statement {
    /** Привязывает параметры; при повторном вызове предыдущие сбрасываются */
    bind(values?: BindParams): boolean;
    /** bind(values) + step() + reset(): выполнить без чтения результата (INSERT/UPDATE) */
    run(values?: BindParams): void;
    /** Сбрасывает выполнение, чтобы запустить инструкцию заново с новыми параметрами */
    reset(): boolean;
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
    exec(sql: string, params?: BindParams): QueryExecResult[];
    run(sql: string, params?: BindParams): Database;
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
