import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { DemoService } from './demo.service';

@Module({ imports: [OrdersModule], providers: [DemoService], exports: [DemoService] })
export class DemoModule {}
