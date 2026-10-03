import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { priceUpdatesSchema, PriceUpdatesInput, tierSchema, TierInput } from '@fernleaf/shared';
import { Requires } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PricingService } from './pricing.service';

@Controller('pricing/tiers')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Requires('pricing.read', 'companies.read')
  @Get()
  list() {
    return this.pricing.listTiers();
  }

  @Requires('pricing.write')
  @Post()
  create(@Body(new ZodPipe(tierSchema)) body: TierInput) {
    return this.pricing.createTier(body);
  }

  @Requires('pricing.write')
  @Put(':id')
  update(@Param('id') id: string, @Body(new ZodPipe(tierSchema)) body: TierInput) {
    return this.pricing.updateTier(id, body);
  }

  @Requires('pricing.write')
  @Post(':id/default')
  setDefault(@Param('id') id: string) {
    return this.pricing.setDefault(id);
  }

  @Requires('pricing.read')
  @Get(':id/grid')
  grid(@Param('id') id: string) {
    return this.pricing.grid(id);
  }

  @Requires('pricing.write')
  @Put(':id/prices')
  updatePrices(@Param('id') id: string, @Body(new ZodPipe(priceUpdatesSchema)) body: PriceUpdatesInput) {
    return this.pricing.updatePrices(id, body);
  }
}
