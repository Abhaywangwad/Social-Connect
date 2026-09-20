import AppError from '../utils/AppError.js';
import { containsMongoOperators, sanitizeDataDeep } from '../utils/sanitizer.js';
import { FORBIDDEN_INTERNAL_FIELDS } from '../validations/commonValidation.js';

/**
 * Reusable validation middleware using Zod schemas.
 *
 * @param {Object} schemas
 * @param {import('zod').ZodSchema} [schemas.params]
 * @param {import('zod').ZodSchema} [schemas.query]
 * @param {import('zod').ZodSchema} [schemas.body]
 * @param {boolean} [schemas.rejectInternalFields=true]
 * @returns {import('express').RequestHandler}
 */
export const validate = (schemas = {}) => {
  return (req, _res, next) => {
    try {
      // 1. Protection against MongoDB Operator Injection in params, query, or body
      for (const target of ['params', 'query', 'body']) {
        if (req[target] && containsMongoOperators(req[target])) {
          throw AppError.badRequest(
            `Prohibited character or MongoDB operator detected in request ${target}`,
            'NOSQL_INJECTION_ATTEMPT'
          );
        }
      }

      // 2. Reject attempts by clients to inject internal/system fields in body
      if (schemas.body && req.body && typeof req.body === 'object' && schemas.rejectInternalFields !== false) {
        for (const field of FORBIDDEN_INTERNAL_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(req.body, field)) {
            throw AppError.badRequest(
              `Modifying internal field '${field}' is strictly prohibited`,
              'FORBIDDEN_INTERNAL_FIELD'
            );
          }
        }
      }

      // 3. Validate and sanitize params
      if (schemas.params) {
        const sanitizedParams = sanitizeDataDeep(req.params || {});
        req.params = schemas.params.parse(sanitizedParams);
      }

      // 4. Validate and sanitize query
      if (schemas.query) {
        const sanitizedQuery = sanitizeDataDeep(req.query || {});
        req.query = schemas.query.parse(sanitizedQuery);
      }

      // 5. Validate and sanitize body
      if (schemas.body) {
        const sanitizedBody = sanitizeDataDeep(req.body || {});
        req.body = schemas.body.parse(sanitizedBody);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

export default validate;
