import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

// The canonical service-record schema (JSON Schema draft 2020-12) is the single
// source of truth for what a valid record is. Writes are validated against it
// in the application, because MongoDB's $jsonSchema is only a subset (no
// if/then conditionals, no format assertions) — see mongo-schema.js for the
// derived database-level backstop.
const here = dirname(fileURLToPath(import.meta.url))
export const serviceRecordSchema = JSON.parse(
  readFileSync(join(here, 'service-record.schema.json'), 'utf8')
)

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validator = ajv.compile(serviceRecordSchema)

/**
 * Validate a service record against the canonical schema.
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
export function validateServiceRecord(record) {
  const valid = validator(record)
  const errors = (validator.errors || []).map((e) => ({
    field: e.instancePath || e.params?.missingProperty || '(root)',
    message: e.message
  }))
  return { valid, errors }
}
