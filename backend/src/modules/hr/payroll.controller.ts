import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PayrollService } from './payroll.service';
import { CreatePayrollRunDto, UpdatePayrollRunDto } from './dto/payroll.dto';

@ApiTags('HR - Payroll')
@Controller('hr/payroll-runs')
export class PayrollController {
  constructor(private readonly service: PayrollService) {}

  @Get()
  @Permissions('hr.payroll.view')
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAll(companyId);
  }

  @Get(':id')
  @Permissions('hr.payroll.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @Permissions('hr.payroll.create')
  create(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!);
  }

  @Post(':id/approve')
  @Permissions('hr.payroll.approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.approve(id, user.companyId!, user.userId);
  }

  @Patch(':id')
  @Permissions('hr.payroll.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user.companyId!, user.userId);
  }

  @Delete(':id')
  @Permissions('hr.payroll.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.remove(id, companyId);
  }
}
