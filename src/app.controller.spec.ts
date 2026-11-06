import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { EmailService } from './email.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: {} },
        { provide: EmailService, useValue: { isConfigured: () => true } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('renders the demo checkout with the fixed confirmation recipient', () => {
    const page = appController.getFooldal();

    expect(page.configurationReady).toBe(true);
    expect(page.emailRecipient).toBe('rowiso2946@drtall.com');
    expect(page.products).toHaveLength(3);
  });
});
