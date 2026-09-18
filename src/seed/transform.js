import { createHash } from 'node:crypto'

// Map a legacy Service Insights service record (the point-in-time directory
// export in data/source-services.ndjson) onto the canonical service-record
// schema. Only fields the source actually carries are mapped; the ownership and
// contact fields (owner, ownerEmail, serviceContact, primaryUserGroup) have no
// source in the export and are left for the management tool to collect, so they
// are omitted here. Fields that cannot meet the schema's constraints (e.g. a
// description shorter than the minimum, a non-https start page, a provider that
// does not map to the controlled vocabulary) are omitted rather than coerced.

// Fixed namespace for deriving stable record ids from the legacy id, so the
// import is idempotent and a record keeps the same id across re-seeds.
const ID_NAMESPACE = '6f9b1c2e-7d3a-4b8c-9e1f-2a3b4c5d6e7f'

// UUID v5 (RFC 4122): SHA-1 of namespace bytes + name, with version/variant
// bits set. Gives a deterministic, schema-valid uuid from the legacy id.
export function uuidV5(name, namespace = ID_NAMESPACE) {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(nsBytes).update(String(name)).digest()
  const b = hash.subarray(0, 16)
  b[6] = (b[6] & 0x0f) | 0x50
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

// Legacy provider free-text -> owningOrganisation controlled vocabulary.
// Unlisted or multi-organisation providers fall through to `other`.
const ORG_MAP = {
  defra: 'defra',
  'environment agency': 'environment_agency',
  ea: 'environment_agency',
  'natural england': 'natural_england',
  'rural payments agency': 'rural_payments_agency',
  apha: 'animal_and_plant_health_agency',
  'animal and plant health agency': 'animal_and_plant_health_agency',
  'forestry commission': 'forestry_commission',
  'marine management organisation': 'marine_management_organisation',
  'centre for environment fisheries and aquaculture science':
    'centre_for_environment_fisheries_and_aquaculture_science',
  cefas: 'centre_for_environment_fisheries_and_aquaculture_science',
  'veterinary medicines directorate': 'veterinary_medicines_directorate',
  vmd: 'veterinary_medicines_directorate'
}

// Legacy deliveryGroup name -> deliveryGroup controlled vocabulary. Legacy
// groups with no equivalent (Cross-cutting, Marine and fisheries) are omitted.
const DELIVERY_GROUP_MAP = {
  'Waste and circular economy': 'waste_and_circular_economy',
  'Nature recovery': 'nature_recovery',
  'Animal and Plant Health': 'animal_and_plant_health',
  'Environmental Quality': 'environmental_quality',
  Farming: 'farming',
  Trade: 'trade_and_eu_reset',
  Livestock: 'livestock',
  'Floods, Incidents and Asset Management':
    'floods_incidents_and_asset_management'
}

// Legacy deliveryPhase name -> lifecyclePhase controlled vocabulary.
const PHASE_MAP = {
  Discovery: 'discovery',
  Alpha: 'alpha',
  'Private beta': 'private_beta',
  'Public beta': 'public_beta',
  'Live operation': 'live',
  Retired: 'retired'
}

// Legacy sensitivity name -> sensitivity controlled vocabulary.
const SENSITIVITY_MAP = {
  OFFICIAL: 'official',
  'OFFICIAL-SENSITIVE': 'official_sensitive',
  SECRET: 'secret'
}

const nameOf = (v) => (v && typeof v === 'object' ? v.name : v)
const clean = (v) => (typeof v === 'string' ? v.trim() : v)
const has = (v) => v !== null && v !== undefined && String(v).trim() !== ''

function isoDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  // Source dates arrive as Date instances via EJSON.parse, but tolerate raw
  // extended JSON ({ $date: ... }) and plain strings too.
  const raw = value && typeof value === 'object' ? value.$date : value
  if (!has(raw)) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function mapOrg(provider) {
  const key = clean(nameOf(provider))
  if (!has(key)) return undefined
  const mapped = ORG_MAP[key.toLowerCase()]
  // A recognised single organisation maps to its code; anything else
  // (unknown body, or a multi-organisation string) is `other`.
  return mapped || 'other'
}

/**
 * Transform one legacy service record into a canonical service record.
 * Returns the record ready for validation; the caller validates and decides
 * whether to keep it. Optional fields are included only when present and valid.
 */
export function transformService(src, editor = 'import@serviceinsights') {
  // A few legacy names are full sentences; trim to the schema's 120-char max
  // rather than dropping the record.
  const name = (clean(src.userFacingName) || clean(src.internalName) || '')
    .slice(0, 120)
    .trim()
  const createdAt = isoDate(src.createdAt) || isoDate(src.publishedAt)
  const updatedAt = isoDate(src.updatedAt) || createdAt
  const now = new Date().toISOString()

  const record = {
    id: uuidV5(src.legacyId ?? src.slug ?? name),
    name,
    sensitivity: SENSITIVITY_MAP[nameOf(src.sensitivity)] || 'official',
    audit: {
      createdAt: createdAt || now,
      updatedAt: updatedAt || now,
      updatedBy: editor
    }
  }

  // description: only when it can meet the schema minimum (20 chars).
  const description = clean(src.description)
  if (has(description) && description.length >= 20) {
    record.description = description.slice(0, 300)
  }

  const org = mapOrg(src.provider)
  if (org) record.owningOrganisation = org

  const phase = PHASE_MAP[nameOf(src.deliveryPhase)]
  if (phase) record.lifecyclePhase = phase

  const deliveryGroup = DELIVERY_GROUP_MAP[nameOf(src.deliveryGroup)]
  if (deliveryGroup) record.deliveryGroup = deliveryGroup

  const type = clean(nameOf(src.type))
  if (has(type)) record.type = type.slice(0, 120)

  const programme = clean(nameOf(src.programme))
  if (has(programme)) record.programme = programme.slice(0, 120)

  // startPageUrl: only https urls satisfy the schema pattern.
  const url = clean(src.url)
  if (has(url) && /^https:\/\//.test(url)) record.startPageUrl = url

  return record
}
