import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { Session } from '../../sessions/entities/session.entity';
import { InvoiceItem } from './invoice-item.entity';
import { Payment } from '../../payments/entities/payment.entity';

import { ValueTransformer } from 'typeorm';

export enum InvoiceStatus {
  PENDING = 1,
  PAID = 2,
  REFUNDED = 3,
  CANCELLED = 4,
  VERIFIED = 5,
}

export const InvoiceStatusMap: Record<InvoiceStatus, string> = {
  [InvoiceStatus.PENDING]: 'PENDING',
  [InvoiceStatus.PAID]: 'PAID',
  [InvoiceStatus.REFUNDED]: 'REFUNDED',
  [InvoiceStatus.CANCELLED]: 'CANCELLED',
  [InvoiceStatus.VERIFIED]: 'VERIFIED',
};

export const InvoiceStatusFromDbMap: Record<string, InvoiceStatus> = {
  PENDING: InvoiceStatus.PENDING,
  PAID: InvoiceStatus.PAID,
  REFUNDED: InvoiceStatus.REFUNDED,
  CANCELLED: InvoiceStatus.CANCELLED,
  VERIFIED: InvoiceStatus.VERIFIED,
};

export const InvoiceStatusTransformer: ValueTransformer = {
  to(value: InvoiceStatus): string {
    return InvoiceStatusMap[value] || 'PENDING';
  },
  from(value: string): InvoiceStatus {
    return InvoiceStatusFromDbMap[value] ?? InvoiceStatus.PENDING;
  },
};

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'session_id', type: 'uuid', unique: true })
  sessionId: string;

  @Column({ name: 'invoice_number', unique: true })
  invoiceNumber: string;

  @Column({
    type: 'varchar',
    transformer: InvoiceStatusTransformer,
    default: 'PENDING',
  })
  status: InvoiceStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  taxAmount: number | null;

  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  discountAmount: number | null;

  @Column({ name: 'total_amount', type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @OneToOne(() => Session, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  @OneToMany(() => InvoiceItem, (item) => item.invoice)
  items: InvoiceItem[];

  @OneToOne(() => Payment, (payment) => payment.invoice)
  payment: Payment;
}
