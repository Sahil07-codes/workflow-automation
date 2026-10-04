import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DayOneService } from './day-one.service';

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

@Controller()
export class DayOneController {
  constructor(private readonly dayOne: DayOneService) {}

  @Post('jobs/links')
  submitJobLinks(
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || !Array.isArray((body as { links?: unknown }).links)) {
      throw new BadRequestException('links must be an array of job URLs.');
    }
    return this.dayOne.submitJobLinks(user.id, (body as { links: unknown[] }).links);
  }

  @Post('resumes')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_RESUME_BYTES, files: 1 },
    }),
  )
  uploadResume(
    @CurrentUser() user: { id: string },
    @UploadedFile()
    file?: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ) {
    if (!file) throw new BadRequestException('Choose a PDF resume to upload.');
    return this.dayOne.uploadResume(user.id, file);
  }

  @Get('resumes')
  listResumes(@CurrentUser() user: { id: string }) {
    return this.dayOne.listResumes(user.id);
  }

  @Get('resumes/:id/preview')
  @Header('Cache-Control', 'private, no-store')
  previewResume(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dayOne.previewResume(user.id, id);
  }

  @Delete('resumes/:id')
  deleteResume(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dayOne.deleteResume(user.id, id);
  }

  @Get('notifications')
  listNotifications(@CurrentUser() user: { id: string }) {
    return this.dayOne.listNotifications(user.id);
  }

  @Post('notifications/:id/read')
  markNotificationRead(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dayOne.markNotificationRead(user.id, id);
  }

  @Post('notifications/read-all')
  markAllNotificationsRead(@CurrentUser() user: { id: string }) {
    return this.dayOne.markAllNotificationsRead(user.id);
  }
}
