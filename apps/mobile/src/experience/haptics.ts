export type HapticEvent =
  | 'timeSlotSelection'
  | 'snap'
  | 'save'
  | 'completion'
  | 'storySave'
  | 'destructiveConfirmation'
  | 'validationFailure';

export type HapticImpactStyle = 'light';
export type HapticNotificationType = 'warning' | 'error';

export interface HapticDriver {
  isAvailable(): boolean | Promise<boolean>;
  selection(): Promise<void>;
  impact(style: HapticImpactStyle): Promise<void>;
  notification(type: HapticNotificationType): Promise<void>;
}

export interface HapticAdapter {
  trigger(event: HapticEvent): Promise<boolean>;
  triggerNonBlocking(event: HapticEvent): void;
}

async function dispatchHaptic(driver: HapticDriver, event: HapticEvent): Promise<void> {
  switch (event) {
    case 'timeSlotSelection':
    case 'snap':
      await driver.selection();
      return;
    case 'save':
    case 'completion':
    case 'storySave':
      await driver.impact('light');
      return;
    case 'destructiveConfirmation':
      await driver.notification('warning');
      return;
    case 'validationFailure':
      await driver.notification('error');
  }
}

export function createHapticAdapter(driver: HapticDriver): HapticAdapter {
  const trigger = async (event: HapticEvent): Promise<boolean> => {
    try {
      if (!(await driver.isAvailable())) {
        return false;
      }

      await dispatchHaptic(driver, event);
      return true;
    } catch {
      return false;
    }
  };

  return {
    trigger,
    triggerNonBlocking(event) {
      void trigger(event);
    },
  };
}

export function createFakeHapticDriver({ available }: { available: boolean }) {
  const events: string[] = [];

  const driver: HapticDriver = {
    isAvailable: () => available,
    selection: async () => {
      events.push('selection');
    },
    impact: async (style) => {
      events.push(`impact:${style}`);
    },
    notification: async (type) => {
      events.push(`notification:${type}`);
    },
  };

  return { driver, events };
}
