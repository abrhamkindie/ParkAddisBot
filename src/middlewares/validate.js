/**
 * @file Zod-based request validation middleware.
 *
 * Validates `req.body`, `req.query`, and `req.params` against Zod schemas
 * **before** the route handler runs. On failure, a {@link ValidationError} is
 * thrown with field-level `details` so the client knows exactly what's wrong.
 *
 * @example
 * import { z } from 'zod';
 * import { validate } from '../middlewares/validate.js';
 *
 * const loginSchema = z.object({
 *   email: z.string().email(),
 *   password: z.string().min(6),
 * });
 *
 * router.post('/login', validate({ body: loginSchema }), handler);
 *
 * // With path params:
 * router.get('/spots/:id', validate({ params: schemas.idParam }), handler);
 */

import { ValidationError } from '../utils/errors.js';

/**
 * Express middleware factory that validates one or more input sources.
 *
 * After successful validation, `req.body`, `req.query`, and/or `req.params`
 * are replaced with the **coerced and defaulted** values from the schema.
 *
 * @param {object}  [schemas={}]
 * @param {import('zod').ZodSchema} [schemas.body]   Schema for `req.body`.
 * @param {import('zod').ZodSchema} [schemas.query]   Schema for `req.query`.
 * @param {import('zod').ZodSchema} [schemas.params]  Schema for `req.params`.
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.put('/spots/:id/price',
 *   validate({ params: schemas.idParam, body: schemas.updateSpotPriceBody }),
 *   handler);
 */
export function validate(schemas = {}) {
  return (req, _res, next) => {
    try {
      const errors = [];

      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          errors.push(...formatZodErrors('body', result.error));
        } else {
          req.body = result.data;
        }
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          errors.push(...formatZodErrors('query', result.error));
        } else {
          req.query = result.data;
        }
      }

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          errors.push(...formatZodErrors('params', result.error));
        } else {
          req.params = result.data;
        }
      }

      if (errors.length > 0) {
        throw new ValidationError('Request validation failed', errors);
      }

      next();
    } catch (err) {
      if (err instanceof ValidationError) {
        return next(err);
      }
      next(err);
    }
  };
}

/**
 * Convert a `ZodError` into our standard field-error format.
 *
 * @param {'body'|'query'|'params'} source The input source being validated.
 * @param {import('zod').ZodError} zodError The error from `safeParse`.
 * @returns {Array<{field: string, message: string, code: string}>}
 */
function formatZodErrors(source, zodError) {
  return zodError.issues.map((issue) => ({
    field: [source, ...issue.path].join('.'),
    message: issue.message,
    code: issue.code,
  }));
}
