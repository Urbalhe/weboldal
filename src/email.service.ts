import { Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { OrderRecord } from './app.service.js';

export const demoEmailRecipient = 'rowiso2946@drtall.com';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

@Injectable()
export class EmailService {
  private transporter: Transporter | undefined;

  isConfigured(): boolean {
    return Boolean(
      process.env['SMTP_HOST'] &&
        process.env['SMTP_USER'] &&
        process.env['SMTP_PASS'] &&
        (process.env['SMTP_FROM'] || process.env['SMTP_USER']),
    );
  }

  assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error(
        'A Gmail SMTP-küldés nincs beállítva. Adja meg az SMTP_HOST, SMTP_USER és SMTP_PASS értékeket a .env fájlban.',
      );
    }
  }

  async verifyConnection(): Promise<void> {
    this.assertConfigured();
    this.transporter ??= this.createTransporter();
    await this.transporter.verify();
  }

  async sendDemoConfirmation(order: OrderRecord): Promise<void> {
    this.assertConfigured();
    this.transporter ??= this.createTransporter();

    const safeName = escapeHtml(order.name);
    const safeProduct = escapeHtml(order.product);
    const safeOrderRef = escapeHtml(order.orderRef);
    const safeShippingAddress = escapeHtml(order.shippingAddress);
    const amount = `${new Intl.NumberFormat('hu-HU').format(order.amountHuf)} Ft`;

    await this.transporter.sendMail({
      from: process.env['SMTP_FROM'] || process.env['SMTP_USER'],
      to: demoEmailRecipient,
      subject: `Minta rendelés-visszaigazolás – ${order.orderRef}`,
      text: [
        'Ez egy automatikus minta email a Műhely Webshop tesztfolyamatából.',
        '',
        'Ez a rendelés csak minta. Fizetés és valódi vásárlás nem történt.',
        `Vásárló neve: ${order.name}`,
        `Rendelési azonosító: ${order.orderRef}`,
        `Termék: ${order.product}`,
        `Minta végösszeg: ${amount}`,
        `Szállítási cím: ${order.shippingAddress}`,
        '',
        'Műhely Webshop – mintaüzem',
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;color:#242424;line-height:1.6">
          <h1>Minta rendelés-visszaigazolás</h1>
          <p>Ez egy automatikus minta email a Műhely Webshop tesztfolyamatából.</p>
          <p><strong>Ez a rendelés csak minta. Fizetés és valódi vásárlás nem történt.</strong></p>
          <p><strong>Vásárló neve:</strong> ${safeName}</p>
          <p><strong>Rendelési azonosító:</strong> ${safeOrderRef}</p>
          <p><strong>Termék:</strong> ${safeProduct}</p>
          <p><strong>Minta végösszeg:</strong> ${amount}</p>
          <p><strong>Szállítási cím:</strong> ${safeShippingAddress}</p>
          <p>Műhely Webshop – mintaüzem</p>
        </div>
      `,
    });
  }

  private createTransporter(): Transporter {
    const port = Number(process.env['SMTP_PORT'] || 465);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Az SMTP_PORT értéke érvénytelen.');
    }

    return nodemailer.createTransport({
      host: process.env['SMTP_HOST'],
      port,
      secure: process.env['SMTP_SECURE']
        ? process.env['SMTP_SECURE'].toLowerCase() === 'true'
        : port === 465,
      auth: {
        user: process.env['SMTP_USER'],
        pass: process.env['SMTP_PASS'],
      },
    });
  }
}
