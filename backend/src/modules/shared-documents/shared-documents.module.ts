import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedDocument } from './entities/shared-document.entity';
import { SharedDocumentsService } from './shared-documents.service';
import { SharedDocumentsController } from './shared-documents.controller';
import { SharedDocumentsCleanupCron } from './shared-documents.cron';

@Module({
  imports: [TypeOrmModule.forFeature([SharedDocument])],
  controllers: [SharedDocumentsController],
  providers: [SharedDocumentsService, SharedDocumentsCleanupCron],
})
export class SharedDocumentsModule {}
