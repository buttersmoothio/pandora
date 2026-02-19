import 'ses'

// Use in-memory storage for tests so each fork starts clean
process.env.DATABASE_URL = ':memory:'

// lockdown() is irreversible and process-global — called once per fork
lockdown({
  errorTaming: 'unsafe', // Preserve Vitest stack traces
  overrideTaming: 'moderate', // Compatibility with npm packages
  consoleTaming: 'unsafe', // Keep console for test debugging
  stackFiltering: 'verbose',
})
