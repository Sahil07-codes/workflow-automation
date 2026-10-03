import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@autoapply/shared';

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
