/**
 * Safety checks that run before tests touch any data. Tests truncate and modify tables,
 * so they must only ever run against the dedicated test database.
 */
export const TEST_DATABASE_NAME = 'acarvo_test'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** host:port/database a connection string points to, normalised for comparison. */
export function databaseTarget(connectionString: string) {
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    throw new Error('Test guard: a database connection string could not be parsed; tests stopped.')
  }
  const host = url.hostname.toLowerCase()
  const port = url.port || '5432'
  // Without a database in the URL, PostgreSQL uses the user name.
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || decodeURIComponent(url.username)
  return `${LOCAL_HOSTS.has(host) ? 'localhost' : host}:${port}/${database.toLowerCase()}`
}

/** Refuses to continue when the test connection points to the same database as the main one. */
export function assertSeparateDatabases(testUrl: string, mainUrl: string, label: string) {
  if (databaseTarget(testUrl) === databaseTarget(mainUrl)) {
    throw new Error(`Test guard: ${label} points to the same database as the application. Tests stopped before touching any data.`)
  }
}

/** Asks each live connection which database it is in; anything but acarvo_test stops the tests. */
export async function assertConnectedToTestDatabase(connections: { label: string; currentDatabase: () => Promise<string> }[]) {
  for (const c of connections) {
    const name = await c.currentDatabase()
    if (name !== TEST_DATABASE_NAME) {
      throw new Error(`Test guard: ${c.label} connection is in database "${name}", expected "${TEST_DATABASE_NAME}". Tests stopped before touching any data.`)
    }
  }
}
