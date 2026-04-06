import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Camera, CameraResultType } from '@capacitor/camera';

export const isPlatform = (): 'ios' | 'android' | 'web' => {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
};

export const isNative = (): boolean => {
  return Capacitor.isNativePlatform();
};

export const initializeApp = (): void => {
  if (!isNative()) return;

  App.addListener('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
    if (!canGoBack) {
      App.exitApp();
    } else {
      window.history.back();
    }
  });

  App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
  });
};

export const takePicture = async (): Promise<string | null> => {
  if (!isNative()) {
    return null;
  }
  
  try {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl
    });
    
    if (image.dataUrl) {
      return image.dataUrl;
    } else {
      return null;
    }
  } catch (error) {
    console.error('capacitor.ts: caught error in takePicture():', error);
    throw error;
  }
};
