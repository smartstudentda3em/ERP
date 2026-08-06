import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemService } from './system.service';
import { FactoryResetDto } from './dto/system.dto';

@ApiTags('System')
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  // @Permissions('system.delete') is the first gate (PermissionsGuard rejects with 403 before
  // this method ever runs) — SystemService.factoryReset() re-checks the role and password on top
  // of it; see the comment there for why a single layer isn't considered enough for this action.
  @Post('factory-reset')
  @HttpCode(HttpStatus.OK)
  @Permissions('system.delete')
  factoryReset(@CurrentUser('userId') userId: string, @Body() dto: FactoryResetDto) {
    return this.systemService.factoryReset(userId, dto.password);
  }
}
