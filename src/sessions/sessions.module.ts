import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './entities/session.entity';
import { SessionItem } from './entities/session-item.entity';
import { Product } from '../products/entities/product.entity';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, SessionItem, Product]),
    AuditLogsModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
