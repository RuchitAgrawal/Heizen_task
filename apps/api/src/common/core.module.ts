import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Clock } from './clock';
import { Notifier } from './notifier';
import { SettingsService } from '../settings/settings.service';
import { PricingService } from '../pricing/pricing.service';
import { MenuService } from '../menu/menu.service';

/** Services every feature module uses. */
@Global()
@Module({
  providers: [PrismaService, Clock, Notifier, SettingsService, PricingService, MenuService],
  exports: [PrismaService, Clock, Notifier, SettingsService, PricingService, MenuService],
})
export class CoreModule {}
