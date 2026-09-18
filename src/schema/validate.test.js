import { validateServiceRecord } from './validate.js'

const now = new Date().toISOString()

function validRecord(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Record your catch',
    description:
      'Report a catch to the Marine Management Organisation before you land it.',
    owningOrganisation: 'marine_management_organisation',
    owner: 'A Owner',
    ownerEmail: 'owner@defra.gov.uk',
    serviceContact: {
      name: 'A Contact',
      email: 'contact@defra.gov.uk',
      type: 'Delivery Manager'
    },
    lifecyclePhase: 'live',
    primaryUserGroup: 'businesses',
    sensitivity: 'official',
    startPageUrl: 'https://www.gov.uk/record-catch',
    audit: { createdAt: now, updatedAt: now, updatedBy: 'system' },
    ...overrides
  }
}

describe('#validateServiceRecord', () => {
  test('accepts a complete valid record', () => {
    expect(validateServiceRecord(validRecord()).valid).toBe(true)
  })

  test('rejects a missing required field', () => {
    const record = validRecord()
    delete record.name
    const { valid, errors } = validateServiceRecord(record)
    expect(valid).toBe(false)
    expect(errors.some((e) => e.field === 'name')).toBe(true)
  })

  test('rejects a value outside a controlled vocabulary', () => {
    const { valid } = validateServiceRecord(
      validRecord({ owningOrganisation: 'not_a_real_org' })
    )
    expect(valid).toBe(false)
  })

  test('rejects fields outside the schema (additionalProperties: false)', () => {
    const { valid } = validateServiceRecord(
      validRecord({ somethingElse: 'nope' })
    )
    expect(valid).toBe(false)
  })

  test('requires startPageUrl in public_beta or live', () => {
    const record = validRecord({ lifecyclePhase: 'public_beta' })
    delete record.startPageUrl
    expect(validateServiceRecord(record).valid).toBe(false)
  })

  test('requires primaryUserGroupOther when primaryUserGroup is other', () => {
    const { valid } = validateServiceRecord(
      validRecord({ primaryUserGroup: 'other' })
    )
    expect(valid).toBe(false)
  })

  test('allows an early-phase record without a start page', () => {
    const record = validRecord({ lifecyclePhase: 'discovery' })
    delete record.startPageUrl
    expect(validateServiceRecord(record).valid).toBe(true)
  })
})
