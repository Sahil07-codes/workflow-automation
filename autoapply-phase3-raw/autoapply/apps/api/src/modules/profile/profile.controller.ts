import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private profileService: ProfileService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getProfile(@CurrentUser() user: any) {
    return this.profileService.getProfile(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProfile(
    @CurrentUser() user: any,
    @Body() profileData: any,
  ) {
    return this.profileService.createProfile(user.id, profileData);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser() user: any,
    @Body() profileData: any,
  ) {
    return this.profileService.updateProfile(user.id, profileData);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirmProfile(@CurrentUser() user: any) {
    return this.profileService.confirmProfile(user.id);
  }

  @Get('versions')
  @HttpCode(HttpStatus.OK)
  async getVersions(@CurrentUser() user: any) {
    return this.profileService.getProfileVersions(user.id);
  }
}
