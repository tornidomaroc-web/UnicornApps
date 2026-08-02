import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Camera, CameraResultType } from '@capacitor/camera';
import { MAX_IMAGE_EDGE } from '@/lib/image-budget';

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
    // width/height are a MEMORY hint, not the bound. Asking the plugin to
    // resize means the WebView never holds a 24 MP bitmap as a base64 string in
    // the first place — on a phone that is the difference between ~3 MB and
    // ~200 KB crossing the bridge. The AUTHORITATIVE bound is
    // prepareImageForUpload at the generate call site, because the plugin's
    // scaling semantics differ across platforms and plugin versions and cannot
    // be relied on to produce any particular size.
    //
    // quality stays at 90: the JS side re-encodes anyway, and lowering both
    // would stack two lossy passes for no extra size win.
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
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
