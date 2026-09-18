import { transformService, uuidV5 } from './transform.js'
import { validateServiceRecord } from '../schema/validate.js'

// A legacy record with plenty of populated fields.
function legacy(overrides = {}) {
  return {
    legacyId: 42,
    slug: 'record-catch',
    userFacingName: 'Record your catch',
    internalName: 'Catch recording',
    provider: 'Marine Management Organisation',
    description:
      'Report a catch to the Marine Management Organisation before you land it.',
    deliveryGroup: { name: 'Farming', slug: 'farming' },
    programme: { name: 'Fisheries' },
    type: { name: 'Service' },
    status: { name: 'Published' },
    sensitivity: { name: 'OFFICIAL' },
    deliveryPhase: { name: 'Live operation' },
    url: 'https://www.gov.uk/record-catch',
    createdAt: new Date('2026-04-03T13:11:07.479Z'),
    updatedAt: new Date('2026-07-09T08:55:45.280Z'),
    ...overrides
  }
}

describe('#transformService', () => {
  test('produces a record that passes schema validation', () => {
    const { valid, errors } = validateServiceRecord(transformService(legacy()))
    expect(errors).toEqual([])
    expect(valid).toBe(true)
  })

  test('maps the fields the source carries', () => {
    const r = transformService(legacy())
    expect(r.name).toBe('Record your catch')
    expect(r.owningOrganisation).toBe('marine_management_organisation')
    expect(r.lifecyclePhase).toBe('live')
    expect(r.deliveryGroup).toBe('farming')
    expect(r.type).toBe('Service')
    expect(r.startPageUrl).toBe('https://www.gov.uk/record-catch')
  })

  test('carries the source timestamps into audit', () => {
    const r = transformService(legacy())
    expect(r.audit.createdAt).toBe('2026-04-03T13:11:07.479Z')
    expect(r.audit.updatedAt).toBe('2026-07-09T08:55:45.280Z')
    expect(r.audit.updatedBy).toBe('import@serviceinsights')
  })

  test('derives a stable id from the legacy id', () => {
    expect(transformService(legacy()).id).toBe(transformService(legacy()).id)
    expect(uuidV5(42)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  test('falls back to internalName when there is no user-facing name', () => {
    expect(transformService(legacy({ userFacingName: null })).name).toBe(
      'Catch recording'
    )
  })

  test('omits fields the source cannot satisfy', () => {
    const r = transformService(
      legacy({
        description: 'too short',
        url: 'http://not-secure.example',
        provider: null,
        deliveryGroup: { name: 'Cross-cutting' },
        deliveryPhase: null
      })
    )
    expect(r.description).toBeUndefined()
    expect(r.startPageUrl).toBeUndefined()
    expect(r.owningOrganisation).toBeUndefined()
    expect(r.deliveryGroup).toBeUndefined()
    expect(r.lifecyclePhase).toBeUndefined()
    expect(validateServiceRecord(r).valid).toBe(true)
  })

  test('maps an unrecognised provider to other', () => {
    expect(
      transformService(legacy({ provider: 'HMRC' })).owningOrganisation
    ).toBe('other')
  })

  test('trims an over-long name to the schema maximum', () => {
    const long = 'x'.repeat(200)
    const r = transformService(legacy({ userFacingName: long }))
    expect(r.name.length).toBe(120)
    expect(validateServiceRecord(r).valid).toBe(true)
  })
})
