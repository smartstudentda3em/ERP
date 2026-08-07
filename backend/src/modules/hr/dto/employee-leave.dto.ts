import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { LeaveType } from '../../../entities/enums';

export class CreateEmployeeLeaveDto {
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsEnum(LeaveType) type: LeaveType;
  @IsOptional() @IsString() notes?: string;
}
