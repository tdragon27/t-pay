import React from 'react';
import { BaseToast, ErrorToast, type ToastConfig } from 'react-native-toast-message';
import { Colors, FontFamily, FontSize } from '@/constants/theme';

const text1Style = {
  color: Colors.text1,
  fontFamily: FontFamily.bodySemiBold,
  fontSize: FontSize.md,
};

const text2Style = {
  color: Colors.text2,
  fontFamily: FontFamily.body,
  fontSize: FontSize.sm,
  lineHeight: 18,
};

export const toastConfig: ToastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={{
        backgroundColor: Colors.surface,
        borderLeftColor: Colors.success,
        borderLeftWidth: 4,
        borderRadius: 12,
      }}
      contentContainerStyle={{ paddingHorizontal: 12 }}
      text1Style={text1Style}
      text2Style={text2Style}
    />
  ),
  info: (props) => (
    <BaseToast
      {...props}
      style={{
        backgroundColor: Colors.surface,
        borderLeftColor: Colors.primary,
        borderLeftWidth: 4,
        borderRadius: 12,
      }}
      contentContainerStyle={{ paddingHorizontal: 12 }}
      text1Style={text1Style}
      text2Style={text2Style}
    />
  ),
  error: (props) => (
    <ErrorToast
      {...props}
      style={{
        backgroundColor: Colors.surface,
        borderLeftColor: Colors.error,
        borderLeftWidth: 4,
        borderRadius: 12,
      }}
      contentContainerStyle={{ paddingHorizontal: 12 }}
      text1Style={text1Style}
      text2Style={text2Style}
    />
  ),
};
