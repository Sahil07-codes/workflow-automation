import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: any) {
    try {
      return this.schema.parse(value);
    } catch (error: any) {
      const errors = error.errors?.reduce(
        (acc: Record<string, any>, curr: any) => {
          acc[curr.path.join('.')] = curr.message;
          return acc;
        },
        {},
      );

      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors,
      });
    }
  }
}
