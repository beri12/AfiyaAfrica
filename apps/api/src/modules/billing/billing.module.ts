import { Controller, Get, Global, HttpCode, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { changePlanSchema, type ChangePlanInput } from '@afyalink/shared';
import { Public, RequirePermissions, RequirePermissionsPendingOk, Tenant, type TenantContext } from '../../common/decorators/access';
import { ZodBody } from '../../common/pipes/zod';
import { BillingService } from './billing.service';
import { PaymentProvider, SandboxPaymentProvider } from './payment.provider';

@ApiTags('Billing & subscriptions')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  @Public()
  plans() {
    return this.billing.listPlans();
  }

  @Get('subscription')
  @RequirePermissionsPendingOk('billing:read')
  subscription(@Tenant() t: TenantContext) {
    return this.billing.getSubscription(t.clinicId);
  }

  @Post('subscription/change-plan')
  @RequirePermissions('billing:manage')
  @HttpCode(200)
  changePlan(@Tenant() t: TenantContext, @ZodBody(changePlanSchema) body: ChangePlanInput) {
    return this.billing.changePlan(t.clinicId, t.userId, body.planCode);
  }

  @Get('invoices')
  @RequirePermissions('billing:read')
  invoices(@Tenant() t: TenantContext) {
    return this.billing.listInvoices(t.clinicId);
  }

  @Post('invoices/:id/pay')
  @RequirePermissions('billing:manage')
  @HttpCode(200)
  pay(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.payInvoice(t.clinicId, id, t.userId);
  }
}

@Global()
@Module({
  controllers: [BillingController],
  providers: [BillingService, { provide: PaymentProvider, useClass: SandboxPaymentProvider }],
  exports: [BillingService],
})
export class BillingModule {}
