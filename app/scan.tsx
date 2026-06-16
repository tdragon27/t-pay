// app/scan.tsx

// Full-screen QR scanner for T Pay invoices, Expo payment links, EIP-681, and wallet addresses.



import React, { useEffect, useRef, useState } from 'react';

import {

  View,

  Text,

  StyleSheet,

  TouchableOpacity,

  Dimensions,

} from 'react-native';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRouter } from 'expo-router';

import { safeBack } from '@/utils/navigation';

import { Ionicons } from '@expo/vector-icons';

import { CameraView, useCameraPermissions } from 'expo-camera';

import * as Haptics from 'expo-haptics';

import Toast from 'react-native-toast-message';

import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';

import { buildSendParamsFromRequest, parsePaymentRequest } from '@/services/paymentRequestService';

import { recordPassportEvent } from '@/services/passportService';

import { useWalletStore } from '@/store/walletStore';



const { width, height } = Dimensions.get('window');

const SCAN_SIZE = width * 0.7;

const OVERLAY_COLOR = 'rgba(0,0,0,0.65)';



export default function ScanScreen() {

  const router = useRouter();

  const insets = useSafeAreaInsets();

  const { address } = useWalletStore();

  const [permission, requestPermission] = useCameraPermissions();

  const [scanned, setScanned] = useState(false);

  const lastScanAt = useRef(0);



  useEffect(() => {

    if (!permission?.granted) requestPermission();

  }, [permission?.granted, requestPermission]);



  const handleBarCodeScanned = async ({ data }: { data: string }) => {

    const now = Date.now();

    if (scanned || now - lastScanAt.current < 1_500) return;

    lastScanAt.current = now;

    setScanned(true);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);



    let request;

    try {

      request = parsePaymentRequest(data);

    } catch {

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      Toast.show({ type: 'error', text1: 'QR khong hop le', text2: 'Tap Scan Again and try a T Pay QR.' });

      return;

    }



    if (request.kind === 'invoice') {

      await recordPassportEvent(address, {

        id: `scan_invoice_${request.invoiceId}`,

        type: 'invoice_scan',

        points: 55,

        label: `Scanned invoice ${request.invoiceId}`,

        metadata: { invoiceId: request.invoiceId },

      });

      Toast.show({ type: 'success', text1: 'Invoice detected', text2: request.invoiceId });

      router.replace({ pathname: '/pay' as any, params: { invoiceId: request.invoiceId } });

      return;

    }



    if (request.kind === 'market') {

      await recordPassportEvent(address, {

        id: `scan_market_${request.marketId}`,

        type: 'market_scan',

        points: 45,

        label: `Scanned pick #${request.marketId}`,

        metadata: { marketId: request.marketId },

      });

      Toast.show({ type: 'success', text1: 'Pick detected', text2: `Pick #${request.marketId}` });

      router.replace({ pathname: '/market/[id]' as any, params: { id: request.marketId } });

      return;

    }



    if (request.kind === 'send' || request.kind === 'request' || request.kind === 'split' || request.kind === 'profile') {

      const eventType = request.kind === 'split' ? 'split_bill_scan' : request.kind === 'request' ? 'payment_request_scan' : 'qr_scan';

      await recordPassportEvent(address, {

        id: `scan_${request.kind}_${request.address}_${request.kind !== 'profile' ? (request.amount ?? 'open') : 'profile'}`,

        type: eventType,

        points: request.kind === 'profile' ? 25 : 50,

        label: `Scanned ${request.kind}`,

        metadata: { address: request.address, amount: request.kind !== 'profile' ? request.amount : undefined },

      });

      const title = request.kind === 'split'

        ? 'Split bill detected'

        : request.kind === 'request'

          ? 'Payment request detected'

          : request.kind === 'profile'

            ? 'Wallet profile detected'

            : 'Wallet address detected';

      Toast.show({ type: 'success', text1: title, text2: request.kind !== 'profile' && request.amount ? `${request.amount} ${request.token ?? 'USDC'}` : request.address });

      router.replace({ pathname: '/send' as any, params: buildSendParamsFromRequest(request) });

      return;

    }



    if (request.kind === 'merchant') {

      await recordPassportEvent(address, {

        id: `scan_merchant_${request.merchant}`,

        type: 'qr_scan',

        points: 35,

        label: request.label ?? 'Scanned merchant',

        metadata: { merchant: request.merchant },

      });

      Toast.show({ type: 'success', text1: 'Merchant detected', text2: request.label ?? request.merchant });

      router.replace('/merchant' as any);

      return;

    }



    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    Toast.show({ type: 'error', text1: 'Unsupported QR code', text2: request.reason });

  };

  if (!permission) {

    return (

      <SafeAreaView style={styles.safe}>

        <View style={styles.center}>

          <Text style={styles.message}>Requesting camera permission...</Text>

        </View>

      </SafeAreaView>

    );

  }



  if (!permission.granted) {

    return (

      <SafeAreaView style={styles.safe}>

        <View style={styles.center}>

          <Ionicons name="camera-outline" size={48} color={Colors.text3} />

          <Text style={styles.message}>Camera permission is required to scan T Pay QR codes.</Text>

          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>

            <Text style={styles.permBtnText}>Grant Permission</Text>

          </TouchableOpacity>

          <TouchableOpacity style={{ marginTop: Spacing.sm }} onPress={() => safeBack(router)}>

            <Text style={{ color: Colors.text2, fontSize: FontSize.sm }}>Go Back</Text>

          </TouchableOpacity>

        </View>

      </SafeAreaView>

    );

  }



  return (

    <View style={styles.container}>

      <CameraView

        style={StyleSheet.absoluteFill}

        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}

        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}

      />



      <View style={styles.overlay}>

        <View style={styles.overlayTop} />

        <View style={styles.overlayMiddle}>

          <View style={styles.overlaySide} />

          <View style={styles.scanFrame}>

            <View style={[styles.corner, styles.cornerTL]} />

            <View style={[styles.corner, styles.cornerTR]} />

            <View style={[styles.corner, styles.cornerBL]} />

            <View style={[styles.corner, styles.cornerBR]} />

          </View>

          <View style={styles.overlaySide} />

        </View>

        <View style={styles.overlayBottom} />

      </View>



      <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 26) }]}>

        <TouchableOpacity onPress={() => safeBack(router)} style={styles.closeBtn}>

          <Ionicons name="close" size={26} color={Colors.white} />

        </TouchableOpacity>

        <Text style={styles.headerTitle}>Scan QR Code</Text>

        <View style={{ width: 44 }} />

      </View>



      <View style={styles.instructionsWrap}>

        <View style={styles.instructions}>

          <Ionicons name="scan-outline" size={18} color={Colors.primary} />

          <Text style={styles.instructionsText}>Scan invoice, request, split bill, market, or wallet</Text>

        </View>

      </View>



      {scanned && (

        <View style={styles.rescanWrap}>

          <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>

            <Text style={styles.rescanText}>Scan Again</Text>

          </TouchableOpacity>

        </View>

      )}

    </View>

  );

}



const styles = StyleSheet.create({

  safe: { flex: 1, backgroundColor: Colors.bg },

  container: { flex: 1, backgroundColor: '#000' },

  center: {

    flex: 1,

    alignItems: 'center',

    justifyContent: 'center',

    padding: Spacing.lg,

    gap: Spacing.md,

  },

  message: { fontSize: FontSize.md, color: Colors.text2, textAlign: 'center' },

  permBtn: {

    backgroundColor: Colors.primary,

    paddingHorizontal: Spacing.xl,

    paddingVertical: 14,

    borderRadius: Radius.lg,

  },

  permBtnText: { color: Colors.bg, fontWeight: '700', fontSize: FontSize.md },

  overlay: { ...StyleSheet.absoluteFillObject },

  overlayTop: { flex: 1, backgroundColor: OVERLAY_COLOR },

  overlayMiddle: { flexDirection: 'row', height: SCAN_SIZE },

  overlaySide: { flex: 1, backgroundColor: OVERLAY_COLOR },

  overlayBottom: { flex: 1.5, backgroundColor: OVERLAY_COLOR },

  scanFrame: { width: SCAN_SIZE, height: SCAN_SIZE, position: 'relative' },

  corner: {

    position: 'absolute',

    width: 32,

    height: 32,

    borderColor: Colors.primary,

    borderWidth: 3,

  },

  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },

  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },

  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },

  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },

  header: {

    position: 'absolute',

    top: 0,

    left: 0,

    right: 0,

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    paddingHorizontal: Spacing.md,

    paddingTop: Spacing.sm,

  },

  closeBtn: { padding: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: Radius.full },

  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white },

  instructionsWrap: {

    position: 'absolute',

    bottom: height * 0.28,

    left: 0,

    right: 0,

    alignItems: 'center',

  },

  instructions: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

    backgroundColor: 'rgba(0,0,0,0.62)',

    paddingHorizontal: 16,

    paddingVertical: 10,

    borderRadius: Radius.full,

    borderWidth: 1,

    borderColor: 'rgba(0,212,255,0.3)',

  },

  instructionsText: { fontSize: FontSize.sm, color: Colors.text1, fontWeight: '700' },

  rescanWrap: {

    position: 'absolute',

    bottom: Spacing.xxl,

    left: 0,

    right: 0,

    alignItems: 'center',

  },

  rescanBtn: {

    backgroundColor: Colors.primary,

    paddingHorizontal: Spacing.xl,

    paddingVertical: 14,

    borderRadius: Radius.full,

  },

  rescanText: { color: Colors.bg, fontWeight: '800', fontSize: FontSize.md },

});



















