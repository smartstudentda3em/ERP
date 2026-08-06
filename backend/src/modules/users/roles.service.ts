import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission) private readonly permissionRepo: Repository<Permission>,
  ) {}

  findAll(): Promise<Role[]> {
    return this.roleRepo.find({ relations: ['permissions'], order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id }, relations: ['permissions'] });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  listPermissions(): Promise<Permission[]> {
    return this.permissionRepo.find({ order: { module: 'ASC', action: 'ASC' } });
  }

  async create(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.roleRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Role name already exists');

    const permissions = dto.permissionIds?.length
      ? await this.permissionRepo.find({ where: { id: In(dto.permissionIds) } })
      : [];

    const role = this.roleRepo.create({
      name: dto.name,
      description: dto.description,
      permissions,
    });
    return this.roleRepo.save(role);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id);
    if (role.isSystemRole && (dto.name || dto.permissionIds)) {
      throw new ConflictException('System roles cannot be renamed or have permissions modified');
    }
    if (dto.permissionIds) {
      role.permissions = await this.permissionRepo.find({ where: { id: In(dto.permissionIds) } });
    }
    role.name = dto.name ?? role.name;
    role.description = dto.description ?? role.description;
    return this.roleRepo.save(role);
  }

  async remove(id: string): Promise<void> {
    const role = await this.findOne(id);
    if (role.isSystemRole) throw new ConflictException('System roles cannot be deleted');
    await this.roleRepo.remove(role);
  }
}
