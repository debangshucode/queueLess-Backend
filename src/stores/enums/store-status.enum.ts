import { ValueTransformer } from 'typeorm';

export enum StoreStatus {
  INACTIVE = 1,
  ACTIVE = 2,
}

export const StoreStatusMap: Record<StoreStatus, string> = {
  [StoreStatus.INACTIVE]: 'INACTIVE',
  [StoreStatus.ACTIVE]: 'ACTIVE',
};

export const StoreStatusFromDbMap: Record<string, StoreStatus> = {
  INACTIVE: StoreStatus.INACTIVE,
  ACTIVE: StoreStatus.ACTIVE,
};

export const StoreStatusTransformer: ValueTransformer = {
  to(value: StoreStatus): string {
    return StoreStatusMap[value] || 'ACTIVE';
  },
  from(value: string): StoreStatus {
    return StoreStatusFromDbMap[value] ?? StoreStatus.ACTIVE;
  },
};
