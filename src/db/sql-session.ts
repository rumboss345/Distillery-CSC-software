type SqlStatement = {
  bind(params: unknown[]): void;
  step(): boolean;
  getColumnNames(): string[];
  get(): unknown[];
  free(): void;
};

export type SqlHandle = {
  prepare(sql: string): SqlStatement;
  run(sql: string, params?: unknown[]): void;
};

type WriteListener = () => void;
type MutationRedirect = (name: string, args: unknown[]) => unknown;

let current: SqlHandle | null = null;
let readHandle: (() => SqlHandle | null) | null = null;
let writeListener: WriteListener | null = null;
let mutationRedirect: MutationRedirect | null = null;

export function bindSqlHandle(get: () => SqlHandle | null): void {
  readHandle = get;
}

export function activeSqlHandle(): SqlHandle | null {
  return readHandle ? readHandle() : current;
}

export function setWriteListener(listener: WriteListener | null): void {
  writeListener = listener;
}

export function setProductionMutationRedirect(redirect: MutationRedirect | null): void {
  mutationRedirect = redirect;
}

export type MutationForward =
  | { forwarded: false }
  | { forwarded: true; value: unknown };

/** Browser saves call the server. The server itself runs the function body. */
export function forwardProductionMutation(name: string, args: unknown[]): MutationForward {
  if (!mutationRedirect) return { forwarded: false };
  return { forwarded: true, value: mutationRedirect(name, args) };
}

function database(): SqlHandle | null {
  return activeSqlHandle();
}

function rowToObject<T>(columns: string[], values: unknown[]): T {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = values[i];
  });
  return obj as T;
}

export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const db = database();
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(rowToObject<T>(stmt.getColumnNames(), stmt.get()));
  }
  stmt.free();
  return results;
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | null {
  const rows = queryAll<T>(sql, params);
  return rows[0] ?? null;
}

export function runQuery(sql: string, params: unknown[] = []): void {
  const db = database();
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  writeListener?.();
}

export function insertRow(sql: string, params: unknown[] = []): number {
  runQuery(sql, params);
  const result = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
  return result?.id ?? 0;
}
