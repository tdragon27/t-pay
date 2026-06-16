import React, { useMemo } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  rightIcon?: React.ReactNode;
  onRightIconPress?: () => void;
  hint?: string;
}

function needsDoneAccessory(keyboardType?: TextInputProps['keyboardType']) {
  if (!keyboardType) return false;
  return ['decimal-pad', 'number-pad', 'numeric', 'phone-pad'].includes(String(keyboardType));
}

export function Input({
  label,
  error,
  rightIcon,
  onRightIconPress,
  hint,
  style,
  keyboardType,
  returnKeyType,
  blurOnSubmit,
  onSubmitEditing,
  inputAccessoryViewID,
  multiline,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const borderColor = useSharedValue<string>(Colors.border);
  const numericInput = needsDoneAccessory(keyboardType);
  const generatedAccessoryId = useMemo(() => 'tpay-input-done-' + Math.random().toString(36).slice(2), []);
  const accessoryId = inputAccessoryViewID || (Platform.OS === 'ios' && numericInput ? generatedAccessoryId : undefined);

  const handleFocus: TextInputProps['onFocus'] = (event) => {
    borderColor.value = withTiming(Colors.primary, { duration: 200 });
    onFocus?.(event);
  };

  const handleBlur: TextInputProps['onBlur'] = (event) => {
    borderColor.value = withTiming(error ? Colors.error : Colors.border, { duration: 200 });
    onBlur?.(event);
  };

  const handleSubmitEditing: TextInputProps['onSubmitEditing'] = (event) => {
    onSubmitEditing?.(event);
    if (!multiline) Keyboard.dismiss();
  };

  const animStyle = useAnimatedStyle(() => ({
    borderColor: error ? Colors.error : borderColor.value,
  }));

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Animated.View style={[styles.inputWrap, animStyle]}>
        <RNTextInput
          style={[styles.input, multiline && styles.multilineInput, style]}
          placeholderTextColor={Colors.text3}
          selectionColor={Colors.primary}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType || 'done'}
          blurOnSubmit={blurOnSubmit !== undefined ? blurOnSubmit : !multiline}
          onSubmitEditing={handleSubmitEditing}
          inputAccessoryViewID={accessoryId}
          multiline={multiline}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        />
        {rightIcon ? (
          <TouchableOpacity onPress={onRightIconPress} style={styles.rightIcon} activeOpacity={0.7}>
            {rightIcon}
          </TouchableOpacity>
        ) : null}
      </Animated.View>

      {Platform.OS === 'ios' && numericInput && accessoryId ? (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.accessoryBar}>
            <TouchableOpacity style={styles.doneButton} onPress={Keyboard.dismiss} activeOpacity={0.75}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: {
    fontSize: FontSize.sm,
    color: Colors.text2,
    fontWeight: '500',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.elevated,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    minHeight: 52,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text1,
    paddingVertical: Spacing.sm + 4,
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  rightIcon: { paddingLeft: Spacing.sm },
  accessoryBar: {
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#141722',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  doneButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,212,255,0.14)',
  },
  doneText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  error: {
    fontSize: FontSize.xs,
    color: Colors.error,
    marginTop: 2,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.text3,
    marginTop: 2,
  },
});
