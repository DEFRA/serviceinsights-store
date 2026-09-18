// Load the initial service records into the store from the bundled legacy
// snapshot (data/source-services.ndjson), transforming each onto the canonical
// schema (see transform.js). Every record is validated before it is written;
// records that cannot be made valid are skipped and reported rather than
// letting a bad document into the collection.
//
// Idempotent: records are upserted by their derived id, so re-running updates in
// place and never duplicates. This mirrors the reader service's seed pattern —
// the load runs inside the service container, which has both the snapshot and
// the authenticated DB connection (the CDP terminal is a separate container).
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { MongoClient } from 'mongodb'
import { EJSON } from 'bson'

import { transformService } from './transform.js'
import { validateServiceRecord } from '../schema/validate.js'
import { COLLECTION } from '../services/service-record/repository.js'
import { setupServiceRecords } from '../services/service-record/setup.js'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')

function readSource() {
  const text = readFileSync(join(dataDir, 'source-services.ndjson'), 'utf8')
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => EJSON.parse(line))
}

/**
 * Transform and upsert the bundled snapshot into `db`. Returns a report:
 * { source, written, skipped: [{ name, errors }] }.
 */
export async function seedServiceRecords(db, logger = console) {
  // Ensure the collection and its validator exist before writing.
  await setupServiceRecords(db, logger)

  const source = readSource()
  const col = db.collection(COLLECTION)
  const skipped = []
  let written = 0

  for (const src of source) {
    const record = transformService(src)
    const { valid, errors } = validateServiceRecord(record)
    if (!valid) {
      skipped.push({ name: record.name, errors })
      continue
    }
    await col.replaceOne(
      { _id: record.id },
      { _id: record.id, ...record },
      { upsert: true }
    )
    written++
  }

  return { source: source.length, written, skipped }
}

async function main() {
  const mongoUrl = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/'
  const databaseName = process.env.MONGO_DATABASE || 'serviceinsights_store'

  const client = await MongoClient.connect(mongoUrl)
  try {
    console.log(`Seeding service records into ${databaseName}`)
    const report = await seedServiceRecords(client.db(databaseName))
    console.log(
      `  source ${report.source}, written ${report.written}, skipped ${report.skipped.length}`
    )
    for (const s of report.skipped) {
      console.log(
        `  skipped: ${s.name} — ${s.errors.map((e) => e.field).join(', ')}`
      )
    }
    console.log('Seed complete.')
  } finally {
    await client.close()
  }
}

// Run the CLI only when executed directly, not when imported by the plugin.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error('Seed failed:', err.message)
    process.exit(1)
  })
}
