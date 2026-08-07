import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { CreateEmployeeLeaveDto } from './dto/employee-leave.dto';

@ApiTags('HR - Employees')
@Controller('hr/employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  @Permissions('hr.employee.view')
  findAll(
    @CurrentUser('companyId') companyId: string,
    @Query('search') search?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.findAll(companyId, search, branchId);
  }

  @Get(':id/history')
  @Permissions('hr.employee.view')
  getHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month') month?: string,
  ) {
    return this.service.getHistory(id, companyId, year, month ? Number(month) : undefined);
  }

  @Post(':id/leaves')
  @Permissions('hr.employee.edit')
  createLeave(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateEmployeeLeaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createLeave(id, dto, user.companyId!, user.userId);
  }

  @Delete(':id/leaves/:leaveId')
  @Permissions('hr.employee.edit')
  removeLeave(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('leaveId', ParseUUIDPipe) leaveId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.removeLeave(id, leaveId, user.companyId!);
  }

  @Get(':id')
  @Permissions('hr.employee.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @Permissions('hr.employee.create')
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.companyId!);
  }

  @Patch(':id')
  @Permissions('hr.employee.edit')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user.companyId!);
  }

  @Delete(':id')
  @Permissions('hr.employee.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user.companyId!);
  }
}
