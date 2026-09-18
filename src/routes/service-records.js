import Boom from '@hapi/boom'

import { serviceRecordRepository } from '#/services/service-record/repository.js'

const repo = (request) => serviceRecordRepository(request.db, request.locker)

// The editor's identity is supplied by the calling service (e.g. the CMS, once
// it authenticates users). Defaulted for now; wire to the real principal later.
const editorOf = (request) =>
  request.headers['x-user-id'] || 'system@serviceinsights'

export const serviceRecords = [
  {
    method: 'GET',
    path: '/service-records',
    handler: async (request, h) => {
      const limit = Number(request.query.limit) || 200
      return h.response(await repo(request).list({ limit }))
    }
  },
  {
    method: 'POST',
    path: '/service-records',
    handler: async (request, h) => {
      const created = await repo(request).create(
        request.payload,
        editorOf(request)
      )
      return h.response(created).code(201)
    }
  },
  {
    method: 'GET',
    path: '/service-records/{id}',
    handler: async (request, h) => {
      const record = await repo(request).getById(request.params.id)
      if (!record) {
        return Boom.notFound()
      }
      return h.response(record)
    }
  },
  {
    method: 'PUT',
    path: '/service-records/{id}',
    handler: async (request, h) => {
      // Optimistic concurrency: the caller passes the audit.updatedAt it last
      // saw; the update is rejected (409) if the record changed since.
      const updated = await repo(request).update(
        request.params.id,
        request.payload,
        editorOf(request),
        request.query.expectedUpdatedAt
      )
      return h.response(updated)
    }
  }
]
