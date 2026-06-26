/**
 * @file Standardized API response helpers.
 *
 * Every API response follows the same envelope:
 * ```json
 * { "success": true, "data": { ... }, "meta": { ... } }
 * { "success": false, "error": { "code": "...", "message": "...", "details": [...] } }
 * ```
 *
 * @example
 * import { success, created, paginated } from '../utils/apiResponse.js';
 * success(res, { id: 1, name: 'Bole Spot' });
 * paginated(res, items, { total: 50, limit: 20, offset: 0 });
 */

/**
 * Send a **200 OK** response.
 *
 * @param {import('express').Response} res Express response object.
 * @param {*} data Payload to return as `data`.
 * @param {object} [meta] Optional metadata (e.g. `{ requestId }`).
 * @returns {import('express').Response}
 */
export function success(res, data, meta) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(200).json(body);
}

/**
 * Send a **201 Created** response.
 *
 * @param {import('express').Response} res Express response object.
 * @param {*} data Payload to return as `data`.
 * @param {object} [meta] Optional metadata.
 * @returns {import('express').Response}
 */
export function created(res, data, meta) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(201).json(body);
}

/**
 * Send a **204 No Content** response with no body.
 *
 * @param {import('express').Response} res
 * @returns {import('express').Response}
 */
export function noContent(res) {
  return res.status(204).end();
}

/**
 * Send a **200 OK** response with a paginated data array.
 *
 * The response `meta.pagination` includes `total`, `limit`, `offset`, and
 * `hasMore` so clients can build pagination controls without extra state.
 *
 * @param {import('express').Response} res Express response object.
 * @param {Array} data Array of items for the current page.
 * @param {{ total: number, limit: number, offset: number }} pagination
 * @returns {import('express').Response}
 */
export function paginated(res, data, { total, limit, offset }) {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    },
  });
}

/**
 * Send an error response.
 *
 * Normally called by the global error handler middleware — not directly from
 * route handlers.
 *
 * @param {import('express').Response} res Express response object.
 * @param {{ code: string, statusCode?: number, message: string, details?: Array<{field:string, message:string}> }} [error]
 * @returns {import('express').Response}
 */
export function error(res, { code, statusCode = 500, message, details } = {}) {
  const body = {
    success: false,
    error: { code, message },
  };
  if (details) body.error.details = details;
  return res.status(statusCode).json(body);
}
