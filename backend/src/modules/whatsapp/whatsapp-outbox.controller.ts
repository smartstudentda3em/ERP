import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags } from '@nestjs/swagger';
import { WhatsAppOutboxMessage } from './entities/whatsapp-outbox-message.entity';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('WhatsApp Outbox')
@Controller('whatsapp/outbox')
export class WhatsAppOutboxController {
  constructor(
    @InjectRepository(WhatsAppOutboxMessage) private readonly repo: Repository<WhatsAppOutboxMessage>,
  ) {}

  @Get()
  @Permissions('dashboard.view')
  async findRecent(@CurrentUser('companyId') companyId: string) {
    return this.repo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }
}
