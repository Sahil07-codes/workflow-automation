import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PreferencesService } from './preferences.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@Controller('preferences')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(private preferencesService: PreferencesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getPreferences(@CurrentUser() user: any) {
    return this.preferencesService.getPreferences(user.id);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @CurrentUser() user: any,
    @Body() data: any,
  ) {
    return this.preferencesService.updatePreferences(user.id, data);
  }

  @Post('auto-approve')
  @HttpCode(HttpStatus.OK)
  async setAutoApprove(
    @CurrentUser() user: any,
    @Body() config: any,
  ) {
    return this.preferencesService.setAutoApprove(user.id, config);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async resetDefaults(@CurrentUser() user: any) {
    return this.preferencesService.resetToDefaults(user.id);
  }
}
