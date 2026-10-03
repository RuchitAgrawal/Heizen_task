import { Module } from '@nestjs/common';
import { KitchenModule } from '../kitchen/kitchen.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';

@Module({ imports: [KitchenModule, DispatchModule], controllers: [DashboardsController], providers: [DashboardsService] })
export class DashboardsModule {}
