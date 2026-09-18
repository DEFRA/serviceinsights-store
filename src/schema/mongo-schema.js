import { serviceRecordSchema } from './validate.js'

// Derive a MongoDB $jsonSchema validator from the canonical JSON Schema so the
// two never drift. MongoDB understands a subset of JSON Schema, so we translate
// `type` -> `bsonType` and drop the keywords it does not support (format,
// if/then conditionals in allOf, annotations). The application-level ajv
// validation (validate.js) is authoritative; this is a database-level backstop.

// Schema-level keywords we drop (unsupported by $jsonSchema or annotations).
const DROP_KEYS = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  'format',
  'default',
  'uniqueItems',
  'allOf' // Mongo $jsonSchema does not support if/then conditionals
])
// Keys whose values are maps of {name -> subschema}; the names are arbitrary
// field names and must not be treated as keywords.
const SCHEMA_MAP_KEYS = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions'
])
// Keys whose values are subschemas to translate.
const SCHEMA_KEYS = new Set([
  'items',
  'contains',
  'not',
  'additionalProperties'
])

function translate(node) {
  if (Array.isArray(node)) {
    return node.map(translate)
  }
  if (!node || typeof node !== 'object') {
    return node
  }
  const out = {}
  for (const [key, value] of Object.entries(node)) {
    if (DROP_KEYS.has(key)) {
      continue
    }
    if (key === 'type') {
      out.bsonType = value
    } else if (SCHEMA_MAP_KEYS.has(key)) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, sub]) => [name, translate(sub)])
      )
    } else if (SCHEMA_KEYS.has(key) && value && typeof value === 'object') {
      out[key] = translate(value)
    } else if (key === 'anyOf' || key === 'oneOf') {
      out[key] = value.map(translate)
    } else {
      // enum, required, minLength, maxLength, pattern, additionalProperties:false, etc.
      out[key] = value
    }
  }
  return out
}

export function buildMongoValidator() {
  const mongo = translate(serviceRecordSchema)
  // Records are stored with `_id` set to the record's UUID, so the backstop
  // must allow it alongside the schema fields.
  mongo.properties = { _id: { bsonType: 'string' }, ...mongo.properties }
  return { $jsonSchema: mongo }
}
