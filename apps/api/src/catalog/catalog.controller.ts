import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { dishSchema, DishInput, optionGroupSchema, OptionGroupInput, optionSchema, OptionInput } from '@fernleaf/shared';
import { Requires } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Requires('catalog.read', 'menu.read', 'pricing.read', 'companies.read')
  @Get('dishes')
  dishes(@Query('q') q?: string) {
    return this.catalog.listDishes(q);
  }

  @Requires('catalog.read')
  @Get('dishes/:id')
  dish(@Param('id') id: string) {
    return this.catalog.getDish(id);
  }

  @Requires('catalog.write')
  @Post('dishes')
  createDish(@Body(new ZodPipe(dishSchema)) body: DishInput) {
    return this.catalog.createDish(body);
  }

  @Requires('catalog.write')
  @Put('dishes/:id')
  updateDish(@Param('id') id: string, @Body(new ZodPipe(dishSchema)) body: DishInput) {
    return this.catalog.updateDish(id, body);
  }

  @Requires('catalog.read', 'pricing.read')
  @Get('options')
  options() {
    return this.catalog.listOptions();
  }

  @Requires('catalog.write')
  @Post('options')
  createOption(@Body(new ZodPipe(optionSchema)) body: OptionInput) {
    return this.catalog.createOption(body);
  }

  @Requires('catalog.write')
  @Put('options/:id')
  updateOption(@Param('id') id: string, @Body(new ZodPipe(optionSchema)) body: OptionInput) {
    return this.catalog.updateOption(id, body);
  }

  @Requires('catalog.write')
  @Post('dishes/:id/groups')
  createGroup(@Param('id') id: string, @Body(new ZodPipe(optionGroupSchema)) body: OptionGroupInput) {
    return this.catalog.createGroup(id, body);
  }

  @Requires('catalog.write')
  @Put('groups/:id')
  updateGroup(@Param('id') id: string, @Body(new ZodPipe(optionGroupSchema)) body: OptionGroupInput) {
    return this.catalog.updateGroup(id, body);
  }

  @Requires('catalog.write')
  @Delete('groups/:id')
  deleteGroup(@Param('id') id: string) {
    return this.catalog.deleteGroup(id);
  }
}
