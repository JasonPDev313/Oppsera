export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super('AUTHENTICATION_REQUIRED', message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Permission denied') {
    super('AUTHORIZATION_DENIED', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super('NOT_FOUND', id ? `${entity} ${id} not found` : `${entity} not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string = 'Validation failed',
    details?: Array<{ field: string; message: string }>,
  ) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export class TenantSuspendedError extends AppError {
  constructor() {
    super('TENANT_SUSPENDED', 'This account has been suspended', 403);
  }
}

export class MembershipInactiveError extends AppError {
  constructor() {
    super('MEMBERSHIP_INACTIVE', 'Your membership is not active', 403);
  }
}

export class ModuleNotEnabledError extends AppError {
  constructor(moduleKey: string) {
    super('MODULE_NOT_ENABLED', `The ${moduleKey} module is not enabled for this account`, 403);
  }
}

export class ModuleViewOnlyError extends AppError {
  constructor(moduleKey: string) {
    super('MODULE_VIEW_ONLY', `The ${moduleKey} module is in view-only mode`, 403);
  }
}
