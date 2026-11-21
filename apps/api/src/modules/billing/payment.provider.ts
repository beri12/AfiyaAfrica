import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface ChargeRequest {
  invoiceId: string;
  amountUsdCents: number;
  currency: string;
}

export interface ChargeResult {
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  reference?: string;
  failureReason?: string;
}

/**
 * Payment provider port. Real providers (e.g. Chapa, Telebirr, Stripe) implement this once a commercial
 * agreement is approved and integration-tested. Until then only the sandbox adapter exists.
 */
export abstract class PaymentProvider {
  abstract readonly name: string;
  abstract readonly mode: 'sandbox' | 'live';
  abstract charge(req: ChargeRequest): Promise<ChargeResult>;
}

/**
 * Sandbox adapter: records a simulated, clearly-flagged (`sandbox = true`) payment. No money moves.
 * Amounts of 0 or less fail, so failure paths can be exercised.
 */
@Injectable()
export class SandboxPaymentProvider extends PaymentProvider {
  readonly name = 'sandbox';
  readonly mode = 'sandbox' as const;

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    if (req.amountUsdCents <= 0) return { status: 'FAILED', failureReason: 'Invalid amount' };
    return { status: 'SUCCEEDED', reference: `sandbox_${randomUUID()}` };
  }
}
