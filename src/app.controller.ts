import { Controller, Get, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { AllowAnonymous } from 'src/auth/allow-anonymous.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @AllowAnonymous()
  @Get()
  getHealthCheck(): string {
    Logger.log('Handling getHello request');
    return this.appService.getHealthCheck();
  }
}
