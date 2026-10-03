import { Controller, Get } from '@nestjs/common';
import { Requires } from '../auth/decorators';
import { DashboardsService } from './dashboards.service';

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Requires('dashboard.admin')
  @Get('admin')
  admin() {
    return this.dashboards.admin();
  }

  @Requires('dashboard.kitchen', 'dashboard.admin')
  @Get('kitchen')
  kitchen() {
    return this.dashboards.kitchenDash();
  }

  @Requires('dashboard.dispatch', 'dashboard.admin')
  @Get('dispatch')
  dispatch() {
    return this.dashboards.dispatchDash();
  }
}
