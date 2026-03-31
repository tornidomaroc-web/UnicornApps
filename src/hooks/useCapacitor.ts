'use client';

import { useState, useEffect } from 'react';
import { isPlatform, isNative as isNativeUtil } from '@/lib/capacitor';

export default function useCapacitor() {
  const [isNative, setIsNative] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('web');
  const [isIos, setIsIos] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const native = isNativeUtil();
    const currentPlatform = isPlatform();
    
    setIsNative(native);
    setPlatform(currentPlatform);
    setIsIos(currentPlatform === 'ios');
    setIsAndroid(currentPlatform === 'android');
  }, []);

  return { isNative, platform, isIos, isAndroid };
}
