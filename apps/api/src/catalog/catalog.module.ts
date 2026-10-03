import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ReferenceController } from '../reference/reference.controller';
import { PricingController } from '../pricing/pricing.controller';
import { MenuController } from '../menu/menu.controller';

/** Catalogue, reference lists, price tiers and menu: everything staff set up before orders exist. */
@Module({
  controllers: [CatalogController, ReferenceController, PricingController, MenuController],
  providers: [CatalogService],
})
export class CatalogModule {}
