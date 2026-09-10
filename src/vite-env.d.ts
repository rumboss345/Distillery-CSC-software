/// <reference types="vite/client" />

declare module 'sql.js/dist/sql-wasm.js' {
  export type SqlValue = string | number | null | Uint8Array;

  export class Database {
    constructor(data?: Uint8Array);
    run(sql: string, params?: SqlValue[]): Database;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export class Statement {
    bind(params: SqlValue[]): boolean;
    step(): boolean;
    get(): SqlValue[];
    getColumnNames(): string[];
    free(): void;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}

declare module 'sql.js/dist/sql-wasm.wasm?url' {
  const url: string;
  export default url;
}
