import { Injectable, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { Role } from './entities/role.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly auditLogsService: AuditLogsService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async registerMerchant(dto: RegisterMerchantDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if user already exists
      const existingUser = await queryRunner.manager.findOne(User, {
        where: { email: dto.adminEmail },
      });
      if (existingUser) {
        throw new AppException(
          ErrorCode.USER_ALREADY_EXISTS,
          'User with admin email already exists',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Check if organization already exists with this email
      const existingOrg = await queryRunner.manager.findOne(Organization, {
        where: { email: dto.merchantEmail },
      });
      if (existingOrg) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          'Organization with merchant email already exists',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 1. Create Organization
      const organization = this.organizationRepository.create({
        name: dto.merchantName,
        email: dto.merchantEmail,
        phone: dto.merchantPhone,
        subscriptionPlan: 'FREE',
        status: 'ACTIVE',
      });
      const savedOrg = await queryRunner.manager.save(
        Organization,
        organization,
      );

      // 2. Fetch ORGANIZATION role
      let orgAdminRole = await queryRunner.manager.findOne(Role, {
        where: { name: 'ORGANIZATION' },
      });
      if (!orgAdminRole) {
        orgAdminRole = this.roleRepository.create({
          name: 'ORGANIZATION',
          description: 'Organization Owner / Merchant Admin',
        });
        orgAdminRole = await queryRunner.manager.save(Role, orgAdminRole);
      }

      // 3. Create Admin User
      const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
      const adminUser = this.userRepository.create({
        name: dto.adminName,
        email: dto.adminEmail,
        phone: dto.adminPhone,
        passwordHash,
        status: 'ACTIVE',
        organizationId: savedOrg.id,
        roles: [orgAdminRole],
      });
      const savedUser = await queryRunner.manager.save(User, adminUser);

      await queryRunner.commitTransaction();

      // Log action
      await this.auditLogsService.logAction(
        savedUser.id,
        savedOrg.id,
        null,
        'MERCHANT_REGISTERED',
        'organizations',
        savedOrg.id,
        { adminUserId: savedUser.id },
      );

      return {
        organization: savedOrg,
        adminUser: {
          id: savedUser.id,
          name: savedUser.name,
          email: savedUser.email,
          phone: savedUser.phone,
          status: savedUser.status,
        },
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
      relations: ['roles'],
    });

    if (!user) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'Your account is deactivated or suspended',
        HttpStatus.FORBIDDEN,
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const tokens = await this.generateTokens(user);

    // Save refresh token hash
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    // Log action
    await this.auditLogsService.logAction(
      user.id,
      user.organizationId,
      user.storeId,
      'LOGIN',
      'users',
      user.id,
    );

    return tokens;
  }

  async logout(refreshToken: string) {
    // Revoke the refresh token
    const tokenHash = await this.findMatchingRefreshTokenHash(refreshToken);
    if (tokenHash) {
      await this.refreshTokenRepository.update(
        { tokenHash },
        { isRevoked: true },
      );
    }
    return { message: 'Logged out successfully' };
  }

  async refresh(refreshToken: string) {
    // 1. Verify token cryptographic signature
    let decoded: any;
    try {
      decoded = this.jwtService.verify(refreshToken, {
        secret:
          this.configService.get<string>('JWT_REFRESH_SECRET') ||
          'super-secret-refresh-key-change-in-production',
      });
    } catch (err) {
      throw new AppException(
        ErrorCode.INVALID_TOKEN,
        'Refresh token has expired or is invalid',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const userId = decoded.userId;

    // 2. Fetch the stored token details
    const storedTokens = await this.refreshTokenRepository.find({
      where: { userId, isRevoked: false },
    });

    let validStoredToken: RefreshToken | null = null;
    for (const t of storedTokens) {
      const match = await bcrypt.compare(refreshToken, t.tokenHash);
      if (match) {
        validStoredToken = t;
        break;
      }
    }

    if (!validStoredToken || validStoredToken.expiresAt < new Date()) {
      throw new AppException(
        ErrorCode.INVALID_TOKEN,
        'Refresh token is invalid or expired',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 3. Revoke the old refresh token (rotation)
    validStoredToken.isRevoked = true;
    await this.refreshTokenRepository.save(validStoredToken);

    // 4. Generate new tokens
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles'],
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        'User is no longer active or exists',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const tokens = await this.generateTokens(user);

    // 5. Save new refresh token hash
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async forgotPassword(email: string) {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      // To prevent user enumeration, return a mock success message
      return {
        message: 'If email exists in our system, a reset link has been logged',
      };
    }

    // Generate mock reset token
    const resetToken = this.jwtService.sign(
      { userId: user.id },
      { expiresIn: '15m' },
    );

    // Log the reset link (mock mail sending service)
    console.log(`[MOCK EMAIL SERVICE] Password Reset Request for: ${email}`);
    console.log(
      `[MOCK EMAIL SERVICE] Link: http://localhost:3000/api/v1/auth/change-password?token=${resetToken}`,
    );

    return { message: 'Password reset link logged successfully' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        'User not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const isOldPasswordValid = await bcrypt.compare(
      dto.oldPassword,
      user.passwordHash,
    );
    if (!isOldPasswordValid) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Old password is incorrect',
        HttpStatus.BAD_REQUEST,
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    user.passwordHash = passwordHash;
    await this.userRepository.save(user);

    // Log action
    await this.auditLogsService.logAction(
      user.id,
      user.organizationId,
      user.storeId,
      'PASSWORD_CHANGED',
      'users',
      user.id,
    );

    return { message: 'Password updated successfully' };
  }

  // --- Helper Methods ---

  private async generateTokens(user: User) {
    const primaryRole =
      user.roles && user.roles.length > 0 ? user.roles[0].name : 'ATTENDANT';
    const payload = {
      userId: user.id,
      organizationId: user.organizationId,
      storeId: user.storeId,
      role: primaryRole,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret:
        this.configService.get<string>('JWT_ACCESS_SECRET') ||
        'super-secret-access-key-change-in-production',
      expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRATION') ||
        '15m') as any,
    });

    const refreshToken = this.jwtService.sign(
      { userId: user.id },
      {
        secret:
          this.configService.get<string>('JWT_REFRESH_SECRET') ||
          'super-secret-refresh-key-change-in-production',
        expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRATION') ||
          '7d') as any,
      },
    );

    return {
      accessToken,
      refreshToken,
    };
  }

  private async saveRefreshToken(userId: string, token: string) {
    const tokenHash = await bcrypt.hash(token, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const refreshTokenEntity = this.refreshTokenRepository.create({
      userId,
      tokenHash,
      expiresAt,
      isRevoked: false,
    });

    await this.refreshTokenRepository.save(refreshTokenEntity);
  }

  private async findMatchingRefreshTokenHash(
    token: string,
  ): Promise<string | null> {
    const stored = await this.refreshTokenRepository.find();
    for (const t of stored) {
      const match = await bcrypt.compare(token, t.tokenHash);
      if (match) {
        return t.tokenHash;
      }
    }
    return null;
  }
}
