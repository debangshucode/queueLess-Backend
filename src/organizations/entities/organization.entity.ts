import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ name: 'subscription_plan', default: 'FREE' })
  subscriptionPlan: string;

  @Column({ default: 'ACTIVE' })
  status: string; // ACTIVE, INACTIVE, SUSPENDED

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Store, (store) => store.organization)
  stores: Store[];

  @OneToMany(() => User, (user) => user.organization)
  users: User[];
}
