import { IsString, MinLength } from 'class-validator';

export class FactoryResetDto {
  // Checked against a fixed reset code ('0145' — see SystemService.factoryReset()), not the
  // caller's real account password.
  @IsString()
  @MinLength(1)
  password: string;
}
