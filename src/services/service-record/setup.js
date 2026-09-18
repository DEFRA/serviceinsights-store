import { buildMongoValidator } from '#/schema/mongo-schema.js'
import { COLLECTION } from './repository.js'

// Apply the collection's schema validator and indexes on startup. Idempotent:
// creates the collection with the validator if absent, otherwise updates the
// validator in place, then ensures the indexes. Called from the mongodb plugin.
export async function setupServiceRecords(db, logger) {
  const validator = buildMongoValidator()
  const names = await db.listCollections({ name: COLLECTION }).toArray()

  if (names.length === 0) {
    await db.createCollection(COLLECTION, {
      validator,
      validationLevel: 'strict',
      validationAction: 'error'
    })
    logger?.info(`Created ${COLLECTION} collection with schema validator`)
  } else {
    await db.command({
      collMod: COLLECTION,
      validator,
      validationLevel: 'strict',
      validationAction: 'error'
    })
    logger?.info(`Updated ${COLLECTION} schema validator`)
  }

  const col = db.collection(COLLECTION)
  await col.createIndexes([
    { key: { owningOrganisation: 1 }, name: 'owningOrganisation' },
    { key: { deliveryGroup: 1 }, name: 'deliveryGroup' },
    { key: { lifecyclePhase: 1 }, name: 'lifecyclePhase' },
    { key: { name: 1 }, name: 'name' }
  ])
}
