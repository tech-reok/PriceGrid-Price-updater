import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ValidationError, type ErrorDetail } from '../common/errors';

export type ValidationSource = 'body' | 'query' | 'params';

export function zodDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || undefined,
    message: issue.message
  }));
}

/**
 * Validation middleware. Parsed values replace the request body for `body`
 * requests and are exposed as `validatedQuery` for `query` requests.
 */
export function validate(schema: ZodTypeAny, source: ValidationSource = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse((req as any)[source] ?? {});

    if (!result.success) {
      return next(new ValidationError('Invalid input', zodDetails(result.error)));
    }

    if (source === 'body') {
      req.body = result.data;
    } else if (source === 'query') {
      (req as any).validatedQuery = result.data;
    }

    next();
  };
}
