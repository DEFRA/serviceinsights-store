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

  test('requires primaryUserGroupOther when primaryUserGroup is other', () => {
    const { valid } = validateServiceRecord(
      validRecord({ primaryUserGroup: 'other' })
    )
    expect(valid).toBe(false)
  })

  test('accepts the minimal alpha record (ownership fields optional)', () => {
    // The source directory export has no owner/contact/user-group data; those
    // are collected by the management tool later, so a record without them is
    // valid during the alpha.
    const record = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'A minimal service',
      sensitivity: 'official',
      audit: { createdAt: now, updatedAt: now, updatedBy: 'import' }
    }
    expect(validateServiceRecord(record).valid).toBe(true)
  })

  test('allows a live record without a start page', () => {
    const record = validRecord({ lifecyclePhase: 'live' })
    delete record.startPageUrl
    expect(validateServiceRecord(record).valid).toBe(true)
  })
})
