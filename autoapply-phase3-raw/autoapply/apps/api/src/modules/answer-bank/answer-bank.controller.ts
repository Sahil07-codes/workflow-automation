import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AnswerBankService } from './answer-bank.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@Controller('answer-bank')
@UseGuards(JwtAuthGuard)
export class AnswerBankController {
  constructor(private answerBankService: AnswerBankService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async saveAnswer(
    @CurrentUser() user: any,
    @Body('question') question: string,
    @Body('answer') answer: string,
  ) {
    return this.answerBankService.saveAnswer(user.id, question, answer);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllAnswers(@CurrentUser() user: any) {
    return this.answerBankService.getAllAnswers(user.id);
  }

  @Get('search')
  @HttpCode(HttpStatus.OK)
  async searchAnswers(
    @CurrentUser() user: any,
    @Query('q') query: string,
  ) {
    return this.answerBankService.searchAnswers(user.id, query);
  }

  @Get(':questionHash')
  @HttpCode(HttpStatus.OK)
  async getAnswer(
    @CurrentUser() user: any,
    @Query('question') question: string,
  ) {
    return this.answerBankService.getAnswer(user.id, question);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAnswer(
    @CurrentUser() user: any,
    @Query('question') question: string,
  ) {
    return this.answerBankService.deleteAnswer(user.id, question);
  }
}
