import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { PayrollRunLine } from './entities/payroll-run.entity';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee) private readonly repo: Repository<Employee>,
    @InjectRepository(PayrollRunLine) private readonly payrollLineRepo: Repository<PayrollRunLine>,
  ) {}

  findAll(companyId: string) {
    return this.repo.find({ where: { companyId }, relations: ['branch'], order: { createdAt: 'DESC' } });
  }

  findOne(id: string, companyId: string) {
    return this.repo.findOne({ where: { id, companyId }, relations: ['branch'] });
  }

  create(dto: CreateEmployeeDto, companyId: string): Promise<Employee> {
    const employee = this.repo.create({
      companyId,
      name: dto.name,
      jobTitle: dto.jobTitle,
      branchId: dto.branchId,
      baseSalary: dto.baseSalary,
      isActive: dto.isActive ?? true,
    });
    return this.repo.save(employee);
  }

  async update(id: string, dto: UpdateEmployeeDto, companyId: string): Promise<Employee> {
    const employee = await this.repo.findOne({ where: { id, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    if (dto.name !== undefined) employee.name = dto.name;
    if (dto.jobTitle !== undefined) employee.jobTitle = dto.jobTitle;
    if (dto.branchId !== undefined) employee.branchId = dto.branchId;
    if (dto.baseSalary !== undefined) employee.baseSalary = dto.baseSalary;
    if (dto.isActive !== undefined) employee.isActive = dto.isActive;

    return this.repo.save(employee);
  }

  /** Employees already referenced by a payroll line (any month) can't be hard-deleted — that
   * history has to stay intact for the Expense/Profit reports it already fed. Deactivating
   * (isActive: false) is the way to retire an employee from future payroll runs instead. */
  async remove(id: string, companyId: string): Promise<void> {
    const employee = await this.repo.findOne({ where: { id, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const hasPayrollHistory = await this.payrollLineRepo.exist({ where: { employeeId: id } });
    if (hasPayrollHistory) {
      throw new BadRequestException('Cannot delete an employee with payroll history — deactivate instead');
    }

    await this.repo.remove(employee);
  }
}
