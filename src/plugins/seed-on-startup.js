import { seedServiceRecords } from '#/seed/seed.js'
import { COLLECTION } from '#/services/service-record/repository.js'

// Alpha data load: on boot, if the store holds no service records, transform and
// load the bundled legacy snapshot. This runs inside the service container —
// which has both the snapshot and the authenticated DB connection — because the
// CDP terminal is a separate tooling container that cannot run the seed script.
//
// Safe: it only acts on an empty collection and never overwrites existing data.
// The seed itself upserts by id, so a deliberate re-seed stays idempotent.
export const seedOnStartup = {
  plugin: {
    name: 'seed-on-startup',
    register: async (server) => {
      const existing = await server.db.collection(COLLECTION).countDocuments()
      if (existing > 0) {
        server.logger.info(
          `Seed skipped: ${COLLECTION} already has ${existing} documents`
        )
        return
      }
      server.logger.info(
        'Empty service-record store detected — seeding from the bundled snapshot'
      )
      const report = await seedServiceRecords(server.db, server.logger)
      server.logger.info(
        {
          source: report.source,
          written: report.written,
          skipped: report.skipped.length
        },
        'Seed complete'
      )
    }
  }
}
