import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { EmailService } from './../src/email.service.js';

describe('Demo checkout (e2e)', () => {
  let app: INestApplication;
  const originalDatabasePath = process.env['ORDER_DB_PATH'];
  let emailConfigured = true;
  const sentOrders: Array<{
    email: string;
    paymentStatus: string;
    emailSent: boolean;
  }> = [];

  beforeEach(async () => {
    process.env['ORDER_DB_PATH'] = ':memory:';
    emailConfigured = true;
    sentOrders.length = 0;
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({
        isConfigured: () => emailConfigured,
        assertConfigured: () => {
          if (!emailConfigured) {
            throw new Error('A Gmail SMTP-küldés nincs beállítva.');
          }
        },
        verifyConnection: async () => undefined,
        sendDemoConfirmation: async (order: {
          email: string;
          paymentStatus: string;
          emailSent: boolean;
        }) => {
          sentOrders.push(order);
        },
      })
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.useStaticAssets(join(process.cwd(), 'public'));
    app.setBaseViewsDir(join(process.cwd(), 'views'));
    app.setViewEngine('ejs');
    await app.init();
  });

  it('renders the demo checkout without card or customer email fields', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((response) => {
        expect(response.text).toContain('Minta visszaigazolás küldése');
        expect(response.text).toContain('rowiso2946@drtall.com');
        expect(response.text).not.toContain('name="email"');
        expect(response.text).not.toContain('name="card_number"');
        expect(response.text).not.toContain('SimplePay');
      });
  });

  it('saves a sample order and sends confirmation only to the fixed recipient', async () => {
    await request(app.getHttpServer())
      .post('/')
      .type('form')
      .send({
        product_id: 'classic',
        name: 'Teszt Elek',
        billing_city: 'Budapest',
        billing_postal_code: '1051',
        billing_street: 'Kossuth Lajos utca 10',
        shipping_city: 'Szeged',
        shipping_postal_code: '6720',
        shipping_street: 'Tisza Lajos utca 4',
        phone_number: '+36 30 123 4567',
        coupon_code: 'PT-1255',
      })
      .expect(200)
      .expect((response) => {
        expect(response.text).toContain('minta visszaigazoló email elküldve');
        expect(response.text).toContain('rowiso2946@drtall.com');
      });

    expect(sentOrders).toHaveLength(1);
    expect(sentOrders[0]).toMatchObject({
      email: 'rowiso2946@drtall.com',
      paymentStatus: 'DEMO',
      emailSent: false,
    });
  });

  it('does not save or claim an order when email delivery is not configured', async () => {
    emailConfigured = false;

    await request(app.getHttpServer())
      .post('/')
      .type('form')
      .send({
        product_id: 'classic',
        name: 'Teszt Elek',
        billing_city: 'Budapest',
        billing_postal_code: '1051',
        billing_street: 'Kossuth Lajos utca 10',
        shipping_city: 'Szeged',
        shipping_postal_code: '6720',
        shipping_street: 'Tisza Lajos utca 4',
        phone_number: '+36 30 123 4567',
      })
      .expect(503)
      .expect((response) => {
        expect(response.text).toContain('Gmail SMTP');
        expect(response.text).not.toContain('email elküldve');
      });

    expect(sentOrders).toHaveLength(0);
  });

  afterEach(async () => {
    if (app) await app.close();
    if (originalDatabasePath === undefined) delete process.env['ORDER_DB_PATH'];
    else process.env['ORDER_DB_PATH'] = originalDatabasePath;
  });
});
