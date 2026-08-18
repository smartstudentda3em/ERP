import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UpdateOwnProfileDto } from './dto/user.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('users.view')
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.usersService.findAllForCompany(companyId);
  }

  // Declared before ':id' below — Nest matches routes in declaration order, and ':id' would
  // otherwise swallow "/users/me" (with id='me') first. No @Permissions at all: every logged-in
  // user, of any role, may view/edit their own "Account Settings" profile.
  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getOwnProfile(user.userId);
  }

  @Patch('me')
  updateOwnProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOwnProfileDto) {
    return this.usersService.updateOwnProfile(user.userId, dto);
  }

  @Get(':id')
  @Permissions('users.view')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') callerId: string,
  ) {
    return this.usersService.findOneScoped(id, companyId, callerId);
  }

  @Post()
  @Permissions('users.create')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.create(dto, user);
  }

  @Patch(':id')
  @Permissions('users.edit')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.update(id, dto, user);
  }

  @Delete(':id')
  @Permissions('users.delete')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') callerId: string,
  ) {
    return this.usersService.remove(id, companyId, callerId);
  }
}
