import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderBuilder } from './order-builder';
import { CutoffService } from './cutoff.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrderBuilder, CutoffService],
  exports: [OrdersService, CutoffService],
})
export class OrdersModule {}
