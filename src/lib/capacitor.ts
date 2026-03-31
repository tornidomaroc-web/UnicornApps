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
    console.log('App state changed. Is active?', isActive);
  });
};

export const takePicture = async (): Promise<string | null> => {
  console.log('capacitor.ts: entering takePicture()');
  if (!isNative()) {
    console.log('capacitor.ts: isNative = false, returning null');
    return null;
  }
  
  try {
    console.log('capacitor.ts: calling Camera.getPhoto');
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl
    });
    
    if (image.dataUrl) {
      console.log('capacitor.ts: result received from Camera.getPhoto (dataUrl present)');
      return image.dataUrl;
    } else {
      console.log('capacitor.ts: result received but dataUrl is missing');
      return null;
    }
  } catch (error) {
    console.error('capacitor.ts: caught error in takePicture():', error);
    throw error;
  }
};
