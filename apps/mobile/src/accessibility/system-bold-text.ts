import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useSystemBoldText(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;

    let active = true;
    void AccessibilityInfo.isBoldTextEnabled()
      .then((value) => {
        if (active) setEnabled(value);
      })
      .catch(() => {
        if (active) setEnabled(false);
      });

    const subscription = AccessibilityInfo.addEventListener('boldTextChanged', (value) => {
      if (active) setEnabled(value);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
