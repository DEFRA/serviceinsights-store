import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'

import { validateServiceRecord } from '#/schema/validate.js'

export const COLLECTION = 'serviceRecords'

// System fields the store owns — never accepted from the caller.
function stripSystemFields(input) {
  const clean = { ...input }
  delete clean.id
  delete clean.audit
  return clean
}

// A rule the JSON Schema cannot express (date comparison), enforced here.
function assertDateOrder(record) {
  const { lifecyclePhaseStartDate: start, lifecyclePhaseEndDate: end } = record
  if (start && end && end < start) {
    throw Boom.badRequest(
      'lifecyclePhaseEndDate must be on or after lifecyclePhaseStartDate'
    )
  }
}

function validate(record) {
  const { valid, errors } = validateServiceRecord(record)
  if (!valid) {
    const err = Boom.badRequest('Service record failed validation')
    err.output.payload.errors = errors
    throw err
  }
  assertDateOrder(record)
}

/**
 * Data access for service records. Writes are validated against the canonical
 * schema, stamp the audit metadata, and are safe under concurrent editing:
 * optimistic concurrency via `audit.updatedAt` guarantees no lost update, and
 * an advisory lock avoids collisions in the first place.
 */
export function serviceRecordRepository(db, locker) {
  const col = db.collection(COLLECTION)

  return {
    async list({ limit = 200 } = {}) {
      return col
        .find({}, { projection: { _id: 0 } })
        .collation({ locale: 'en' })
        .sort({ name: 1 })
        .limit(limit)
        .toArray()
    },

    async getById(id) {
      return col.findOne({ _id: id }, { projection: { _id: 0 } })
    },

    async create(input, editor) {
      const now = new Date().toISOString()
      const record = {
        ...stripSystemFields(input),
        id: randomUUID(),
        audit: { createdAt: now, updatedAt: now, updatedBy: editor }
      }
      validate(record)
      try {
        await col.insertOne({ _id: record.id, ...record })
      } catch (err) {
        if (err.code === 11000) {
          throw Boom.conflict(`A record with id ${record.id} already exists`)
        }
        throw err
      }
      return record
    },

    async update(id, input, editor, expectedUpdatedAt) {
      const lock = locker ? await locker.lock(`serviceRecord:${id}`) : null
      if (locker && !lock) {
        throw Boom.conflict('This record is being edited by someone else')
      }
      try {
        const existing = await col.findOne({ _id: id })
        if (!existing) {
          throw Boom.notFound()
        }
        const now = new Date().toISOString()
        const record = {
          ...stripSystemFields(input),
          id,
          audit: {
            createdAt: existing.audit.createdAt,
            updatedAt: now,
            updatedBy: editor
          }
        }
        validate(record)

        // Optimistic concurrency: only replace if the record has not changed
        // since the editor loaded it.
        const filter = { _id: id }
        if (expectedUpdatedAt) {
          filter['audit.updatedAt'] = expectedUpdatedAt
        }
        const res = await col.replaceOne(filter, { _id: id, ...record })
        if (res.matchedCount === 0) {
          throw Boom.conflict(
            'The record was changed by someone else. Reload and reapply your changes.'
          )
        }
        return record
      } finally {
        if (lock) {
          await lock.free()
        }
      }
    }
  }
}
