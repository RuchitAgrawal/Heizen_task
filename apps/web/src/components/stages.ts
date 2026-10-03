import type { Tone } from './ui';

export const STAGE_LABEL: Record<string, string> = {
  WAITING: 'Not started',
  COOKING: 'Cooking',
  KITCHEN_READY: 'Kitchen ready',
  DISPATCH_READY: 'Dispatch ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
};

export const STAGE_TONE: Record<string, Tone> = {
  WAITING: 'neutral',
  COOKING: 'amber',
  KITCHEN_READY: 'blue',
  DISPATCH_READY: 'violet',
  OUT_FOR_DELIVERY: 'violet',
  DELIVERED: 'green',
};
