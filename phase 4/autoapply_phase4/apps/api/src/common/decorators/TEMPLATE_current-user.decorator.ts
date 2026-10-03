/**
 * TEMPLATE: CurrentUser Decorator
 * 
 * This file is a template showing what decorator is expected.
 * Your existing auth module should already have this.
 * 
 * If it doesn't exist, create it in your auth module:
 * apps/api/src/modules/auth/decorators/current-user.decorator.ts
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  // Your existing implementation should extract user ID from JWT
  // For example:
  return request.user?.id || request.user?.sub;
});
