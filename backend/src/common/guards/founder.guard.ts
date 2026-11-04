import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';

/**
 * Lets through ONLY the system's founder/owner (users.isFounder). Re-read from the database on every
 * call — never trusted from the token — and independent of roles/permissions on purpose: another
 * Administrator, however powerful, gets a 403. Nothing in the API can set the flag.
 */
@Injectable()
export class FounderGuard implements CanActivate {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId: string | undefined = context.switchToHttp().getRequest().user?.userId;
    const row = userId
      ? await this.userRepo
          .createQueryBuilder('u')
          .select('u.id')
          .addSelect('u.isFounder')
          .where('u.id = :userId', { userId })
          .getOne()
      : null;
    if (!row?.isFounder) throw new ForbiddenException('غير مصرح لك بالاطلاع على سجل الإجراءات');
    return true;
  }
}
