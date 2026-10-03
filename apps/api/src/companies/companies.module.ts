import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { EmployeesController } from '../employees/employees.controller';
import { EmployeesService } from '../employees/employees.service';
import { SettingsController } from '../settings/settings.controller';

@Module({
  controllers: [CompaniesController, EmployeesController, SettingsController],
  providers: [CompaniesService, EmployeesService],
})
export class CompaniesModule {}
