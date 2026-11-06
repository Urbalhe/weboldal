import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Render,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppService, type CreateOrderInput } from './app.service.js';
import {
  demoEmailRecipient,
  EmailService,
} from './email.service.js';

interface OrderFormData {
  product_id: string;
  name: string;
  billing_city: string;
  billing_postal_code: string;
  billing_street: string;
  shipping_city: string;
  shipping_postal_code: string;
  shipping_street: string;
  phone_number: string;
  coupon_code: string;
}

const products = [
  {
    id: 'classic',
    name: 'Klasszikus kávéscsésze',
    image: '/images/classic-cup.svg',
    price: 4990,
  },
  {
    id: 'color',
    name: 'Színes kávéscsésze',
    image: '/images/color-cup.svg',
    price: 5490,
  },
  {
    id: 'travel',
    name: 'Utazó kávéspohár',
    image: '/images/travel-cup.svg',
    price: 6990,
  },
] as const;

const emptyForm: OrderFormData = {
  product_id: 'classic',
  name: '',
  billing_city: '',
  billing_postal_code: '',
  billing_street: '',
  shipping_city: '',
  shipping_postal_code: '',
  shipping_street: '',
  phone_number: '',
  coupon_code: '',
};

function getString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  return typeof value === 'string' ? value.trim() : '';
}

function getFormData(body: Record<string, unknown>): OrderFormData {
  return {
    product_id: getString(body, 'product_id') || emptyForm.product_id,
    name: getString(body, 'name'),
    billing_city: getString(body, 'billing_city'),
    billing_postal_code: getString(body, 'billing_postal_code'),
    billing_street: getString(body, 'billing_street'),
    shipping_city: getString(body, 'shipping_city'),
    shipping_postal_code: getString(body, 'shipping_postal_code'),
    shipping_street: getString(body, 'shipping_street'),
    phone_number: getString(body, 'phone_number'),
    coupon_code: getString(body, 'coupon_code'),
  };
}

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly emailService: EmailService,
  ) {}

  @Get('/')
  @Render('index')
  getFooldal() {
    return {
      formData: emptyForm,
      products,
      configurationReady: this.emailService.isConfigured(),
      emailRecipient: demoEmailRecipient,
    };
  }

  @Post('/')
  async checkout(
    @Body() body: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const fields =
      body !== null && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const formData = getFormData(fields);
    const renderData = {
      formData,
      products,
      configurationReady: this.emailService.isConfigured(),
      emailRecipient: demoEmailRecipient,
    };
    const selectedProduct = products.find(
      (product) => product.id === formData.product_id,
    );

    if (!selectedProduct) {
      response.status(400).render('index', {
        ...renderData,
        error: 'Válasszon egy terméket.',
      });
      return;
    }

    const nameRegex = /^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,99}$/u;
    if (!nameRegex.test(formData.name)) {
      response.status(400).render('index', {
        ...renderData,
        error: 'Adjon meg egy érvényes nevet.',
      });
      return;
    }

    const cityRegex = /^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,59}$/u;
    if (!cityRegex.test(formData.billing_city)) {
      response.status(400).render('index', {
        ...renderData,
        error: 'Adja meg helyesen a számlázási várost.',
      });
      return;
    }

    const postalCodeRegex = /^\d{4}$/;
    if (!postalCodeRegex.test(formData.billing_postal_code)) {
      response.status(400).render('index', {
        ...renderData,
        error: 'A számlázási irányítószám 4 számjegyből álljon.',
      });
      return;
    }

    const streetRegex =
      /^(?=.*\d)[\p{L}\p{M}\d][\p{L}\p{M}\d .,'’/#-]{1,99}$/u;
    if (!streetRegex.test(formData.billing_street)) {
      response.status(400).render('index', {
        ...renderData,
        error: 'Adja meg helyesen a számlázási utcát és házszámot.',
      });
      return;
    }

    if (!cityRegex.test(formData.shipping_city)) {
      response.status(400).render('index', {
        ...renderData,
        error: 'Adja meg helyesen a szállítási várost.',
      });
      return;
    }

    if (!postalCodeRegex.test(formData.shipping_postal_code)) {
      response.status(400).render('index', {
        ...renderData,
        error: 'A szállítási irányítószám 4 számjegyből álljon.',
      });
      return;
    }

    if (!streetRegex.test(formData.shipping_street)) {
      response.status(400).render('index', {
        ...renderData,
        error: 'Adja meg helyesen a szállítási utcát és házszámot.',
      });
      return;
    }

    const normalizedPhone = formData.phone_number.replace(/[\s()-]/g, '');
    const phoneRegex = /^\+36(?:1\d{7}|(?:20|30|31|50|70)\d{7})$/;
    if (!phoneRegex.test(normalizedPhone)) {
      response.status(400).render('index', {
        ...renderData,
        error: 'Adjon meg érvényes, +36-os magyar telefonszámot.',
      });
      return;
    }

    const couponRegex = /^[A-Z]{2}-\d{4}$/;
    if (formData.coupon_code && !couponRegex.test(formData.coupon_code)) {
      response.status(400).render('index', {
        ...renderData,
        error: 'A kuponkód formátuma két nagybetű-kötőjel-négy számjegy.',
      });
      return;
    }

    try {
      this.emailService.assertConfigured();
      await this.emailService.verifyConnection();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'A Gmail SMTP-küldés nincs megfelelően beállítva.';
      response.status(503).render('index', {
        ...renderData,
        configurationReady: false,
        error: message,
      });
      return;
    }

    const order: CreateOrderInput = {
      product: selectedProduct.name,
      name: formData.name,
      email: demoEmailRecipient,
      billingAddress: `${formData.billing_postal_code} ${formData.billing_city}, ${formData.billing_street}`,
      shippingAddress: `${formData.shipping_postal_code} ${formData.shipping_city}, ${formData.shipping_street}`,
      phoneNumber: normalizedPhone,
      couponCode: formData.coupon_code || null,
      amountHuf: selectedProduct.price,
    };

    let orderReference: { id: number; orderRef: string };
    try {
      orderReference = this.appService.createOrder(order);
    } catch (error) {
      this.logger.error(
        'The order could not be saved.',
        error instanceof Error ? error.stack : String(error),
      );
      response.status(500).render('index', {
        ...renderData,
        error: 'A rendelést nem sikerült menteni. Kérjük, próbálja újra.',
      });
      return;
    }

    try {
      const savedOrder = this.appService.findOrderByReference(
        orderReference.orderRef,
      );
      if (!savedOrder) {
        throw new Error('The saved sample order could not be found.');
      }
      await this.emailService.sendDemoConfirmation(savedOrder);
      this.appService.markConfirmationEmailSent(savedOrder.id);
      response.status(200).render('index', {
        ...renderData,
        formData: emptyForm,
        success: `A minta visszaigazoló email elküldve erre a címre: ${demoEmailRecipient}`,
      });
    } catch (error) {
      this.appService.retryPendingConfirmationEmails();
      this.logger.error(
        `Sample confirmation email failed for order ${orderReference.id}.`,
        error instanceof Error ? error.stack : String(error),
      );
      response.status(503).render('index', {
        ...renderData,
        error: `A minta rendelés elkészült, de az emailt nem sikerült elküldeni a(z) ${demoEmailRecipient} címre. Ellenőrizze a Gmail SMTP-beállításokat; a rendszer újrapróbálja.`,
      });
    }
  }
}
