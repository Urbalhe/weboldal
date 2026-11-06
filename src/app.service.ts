import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EmailService } from './email.service.js';

export interface CreateOrderInput {
  product: string;
  name: string;
  email: string;
  billingAddress: string;
  shippingAddress: string;
  phoneNumber: string;
  couponCode: string | null;
  amountHuf: number;
}

export interface OrderRecord extends CreateOrderInput {
  id: number;
  orderRef: string;
  paymentStatus: string;
  transactionId: string | null;
  emailSent: boolean;
}

@Injectable()
export class AppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppService.name);
  private readonly database: DatabaseSync;
  private emailRetryTimer: NodeJS.Timeout | undefined;
  private sendingEmails = false;

  constructor(private readonly emailService: EmailService) {
    const configuredDatabasePath = process.env['ORDER_DB_PATH'];
    const databasePath =
      configuredDatabasePath || join(process.cwd(), 'data', 'orders.sqlite');
    if (databasePath !== ':memory:') {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product TEXT NOT NULL,
        name TEXT NOT NULL,
        billing_address TEXT NOT NULL,
        shipping_address TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        coupon_code TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.ensureColumn('email', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('order_ref', 'TEXT');
    this.ensureColumn('amount_huf', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('payment_status', "TEXT NOT NULL DEFAULT 'PENDING'");
    this.ensureColumn('transaction_id', 'TEXT');
    this.ensureColumn('email_sent', 'INTEGER NOT NULL DEFAULT 0');
    this.database.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS orders_order_ref_unique ON orders(order_ref) WHERE order_ref IS NOT NULL',
    );
  }

  onModuleInit(): void {
    void this.sendPendingDemoConfirmations();
    this.emailRetryTimer = setInterval(
      () => void this.sendPendingDemoConfirmations(),
      60_000,
    );
    this.emailRetryTimer.unref();
  }

  createOrder(order: CreateOrderInput): { id: number; orderRef: string } {
    const orderRef = randomUUID().replaceAll('-', '');
    const result = this.database
      .prepare(
        `INSERT INTO orders (
          product, name, email, billing_address, shipping_address, phone_number,
          coupon_code, amount_huf, order_ref, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DEMO')`,
      )
      .run(
        order.product,
        order.name,
        order.email,
        order.billingAddress,
        order.shippingAddress,
        order.phoneNumber,
        order.couponCode,
        order.amountHuf,
        orderRef,
      );

    return { id: Number(result.lastInsertRowid), orderRef };
  }

  findOrderByReference(orderRef: string): OrderRecord | null {
    const row = this.database
      .prepare('SELECT * FROM orders WHERE order_ref = ?')
      .get(orderRef) as Record<string, unknown> | undefined;
    return row ? this.toOrderRecord(row) : null;
  }

  retryPendingConfirmationEmails(): void {
    void this.sendPendingDemoConfirmations();
  }

  markConfirmationEmailSent(orderId: number): void {
    this.database
      .prepare('UPDATE orders SET email_sent = 1 WHERE id = ?')
      .run(orderId);
  }

  private ensureColumn(name: string, definition: string): void {
    const columns = this.database
      .prepare('PRAGMA table_info(orders)')
      .all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === name)) {
      this.database.exec(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
    }
  }

  private toOrderRecord(row: Record<string, unknown>): OrderRecord {
    return {
      id: Number(row['id']),
      orderRef: String(row['order_ref']),
      product: String(row['product']),
      name: String(row['name']),
      email: String(row['email']),
      billingAddress: String(row['billing_address']),
      shippingAddress: String(row['shipping_address']),
      phoneNumber: String(row['phone_number']),
      couponCode: row['coupon_code'] === null ? null : String(row['coupon_code']),
      amountHuf: Number(row['amount_huf']),
      paymentStatus: String(row['payment_status']),
      transactionId:
        row['transaction_id'] === null
          ? null
          : String(row['transaction_id']),
      emailSent: Number(row['email_sent']) === 1,
    };
  }

  private async sendPendingDemoConfirmations(): Promise<void> {
    if (this.sendingEmails || !this.emailService.isConfigured()) return;

    this.sendingEmails = true;
    try {
      const rows = this.database
        .prepare(
          `SELECT * FROM orders
           WHERE payment_status = 'DEMO' AND email_sent = 0`,
        )
        .all() as Array<Record<string, unknown>>;

      for (const row of rows) {
        const order = this.toOrderRecord(row);
        try {
          await this.emailService.sendDemoConfirmation(order);
          this.markConfirmationEmailSent(order.id);
        } catch {
          this.logger.warn(
            `Demo confirmation email could not be sent for order ${order.id}; it will be retried.`,
          );
        }
      }
    } finally {
      this.sendingEmails = false;
    }
  }

  onModuleDestroy(): void {
    if (this.emailRetryTimer) clearInterval(this.emailRetryTimer);
    this.database.close();
  }
}
