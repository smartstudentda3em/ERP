import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  fullName: string;

  @IsString()
  @MinLength(8)
  password: string;

  // The primary login identifier — see AuthService.login(). Required and unique across users.
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];

  // Which companies this user may access (ignored entirely for a true Administrator, who has
  // implicit access to every company — see AuthService.extractCompanyIds()).
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  companyIds?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  // Admin-initiated password reset — never the user's own current password, so no oldPassword
  // check here (that's what the self-service POST /auth/change-password endpoint is for).
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];

  // Replaces the user's full set of accessible companies when present (including an empty array,
  // which revokes all access) — ignored entirely for a true Administrator.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  companyIds?: string[];
}

/** Self-service "Account Settings" — deliberately carries only the fields every user (any role,
 * including the protected primary Administrator) may change about their own account. No
 * role/isActive/companyId/companyIds field exists here at all, so there's nothing for
 * UsersService.updateOwnProfile() to even accidentally apply — unlike UpdateUserDto, which an
 * admin uses to edit *someone else's* account and which does carry those fields. */
export class UpdateOwnProfileDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
