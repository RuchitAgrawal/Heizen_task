import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from './common/core.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CompaniesModule } from './companies/companies.module';
import { OrdersModule } from './orders/orders.module';
import { DemoModule } from './demo/demo.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { BillingModule } from './billing/billing.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ScheduleModule.forRoot(), CoreModule, AuthModule, CatalogModule, CompaniesModule, OrdersModule, KitchenModule, DispatchModule, BillingModule, DashboardsModule, DemoModule],
  controllers: [HealthController],
})
export class AppModule {}
