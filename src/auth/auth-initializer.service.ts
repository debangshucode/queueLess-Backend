import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { User } from '../users/entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthInitializerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthInitializerService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    this.logger.log(
      'Initializing database permissions, roles, and default super admin...',
    );
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Seed Permissions
      const permissionRepo = queryRunner.manager.getRepository(Permission);
      const permissionsList = [
        // Organization permissions
        {
          name: 'organization.create',
          description: 'Create new organizations',
        },
        { name: 'organization.read', description: 'View organization details' },
        {
          name: 'organization.update',
          description: 'Update organization details',
        },

        // Store permissions
        {
          name: 'store.create',
          description: 'Create stores within organization',
        },
        { name: 'store.read', description: 'View stores' },
        { name: 'store.update', description: 'Update stores' },
        { name: 'store.delete', description: 'Soft delete stores' },

        // User permissions
        { name: 'user.create', description: 'Create employees' },
        { name: 'user.read', description: 'View employees' },
        { name: 'user.update', description: 'Update employee profiles' },
        { name: 'user.deactivate', description: 'Deactivate employees' },
        { name: 'user.role_assign', description: 'Assign roles to employees' },

        // Product catalog permissions
        { name: 'product.create', description: 'Create products' },
        { name: 'product.read', description: 'View products' },
        { name: 'product.update', description: 'Update products' },
        { name: 'product.delete', description: 'Delete products' },

        // Dashboard/Analytics permissions
        { name: 'dashboard.read', description: 'View dashboard and analytics' },

        // Session permissions
        { name: 'session.create', description: 'Create customer sessions' },
        {
          name: 'session.update',
          description: 'Add/remove products in customer cart session',
        },

        // Invoice permissions
        { name: 'invoice.create', description: 'Create invoices' },

        // Payment permissions
        { name: 'payment.take', description: 'Process payments and checkout' },

        // Exit security permissions
        {
          name: 'receipt.verify',
          description: 'Scan QR and verify customer receipts',
        },
      ];

      const seededPermissions: Record<string, Permission> = {};
      for (const p of permissionsList) {
        let perm = await permissionRepo.findOne({ where: { name: p.name } });
        if (!perm) {
          perm = permissionRepo.create(p);
          perm = await permissionRepo.save(perm);
          this.logger.debug(`Seeded permission: ${p.name}`);
        }
        seededPermissions[p.name] = perm;
      }

      // 2. Seed Roles
      const roleRepo = queryRunner.manager.getRepository(Role);
      const rolesDefinition = [
        {
          name: 'SUPER_ADMIN',
          description:
            'FlowPay Product Owner. Manages all organizations and accounts.',
          permissionNames: [], // Bypasses permission checks dynamically
        },
        {
          name: 'ORGANIZATION',
          description:
            'Store Owner / Business Owner. Manages store settings, employees, products, and views dashboard.',
          permissionNames: [
            'organization.read',
            'organization.update',
            'store.create',
            'store.read',
            'store.update',
            'store.delete',
            'user.create',
            'user.read',
            'user.update',
            'user.deactivate',
            'user.role_assign',
            'product.create',
            'product.read',
            'product.update',
            'product.delete',
            'dashboard.read',
          ],
        },
        {
          name: 'MANAGER',
          description:
            'Senior Store Employee. Accesses dashboard, sales reports, creates sessions/invoices, and processes payments.',
          permissionNames: [
            'dashboard.read',
            'session.create',
            'session.update',
            'invoice.create',
            'payment.take',
          ],
        },
        {
          name: 'ATTENDANT',
          description:
            'Store Billing Employee. Creates customer sessions, updates cart, creates invoices, and takes payments.',
          permissionNames: [
            'session.create',
            'session.update',
            'invoice.create',
            'payment.take',
          ],
        },
        {
          name: 'SECURITY',
          description:
            'Exit Verification Employee. Scans receipts QR codes and verifies purchased items.',
          permissionNames: ['receipt.verify'],
        },
      ];

      const seededRoles: Record<string, Role> = {};
      for (const rDef of rolesDefinition) {
        let role = await roleRepo.findOne({
          where: { name: rDef.name },
          relations: ['permissions'],
        });

        // Find permission entities
        const rolePermissions = rDef.permissionNames.map(
          (name) => seededPermissions[name],
        );

        if (!role) {
          role = roleRepo.create({
            name: rDef.name,
            description: rDef.description,
            permissions: rolePermissions,
          });
          role = await roleRepo.save(role);
          this.logger.debug(`Seeded role: ${rDef.name}`);
        } else {
          // Update permissions list if it changed
          role.permissions = rolePermissions;
          role = await roleRepo.save(role);
        }
        seededRoles[rDef.name] = role;
      }

      // 3. Seed Default Super Admin User (if no users exist in system)
      const userRepo = queryRunner.manager.getRepository(User);
      const userCount = await userRepo.count();
      if (userCount === 0) {
        const passwordHash = await bcrypt.hash('admin123', 10);
        const superAdminUser = userRepo.create({
          name: 'Super Admin',
          email: 'admin@queueless.com',
          phone: '+123456789',
          passwordHash,
          status: 'ACTIVE',
          roles: [seededRoles['SUPER_ADMIN']],
        });
        await userRepo.save(superAdminUser);
        this.logger.log(
          'Seeded default Super Admin user (admin@queueless.com / admin123)',
        );
      }

      await queryRunner.commitTransaction();
      this.logger.log('Database initialization completed successfully.');
    } catch (err) {
      this.logger.error(
        'Database initialization failed. Rolling back transaction.',
        err.stack,
      );
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }
}
