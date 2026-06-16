export const STORAGE_KEYS = {
  WALLET_ADDRESS: 'tpay_address',
  ONBOARDING_COMPLETE: 'tpay_onboarding_v1',
  TRANSACTION_CACHE: 'tpay_txcache_v1',
  SETTINGS: 'tpay_settings_v1',
  SECURITY_SETTINGS: 'tpay_security_settings_v1',
  PIN_ATTEMPTS: 'tpay_pin_attempts_v1',
  PIN_LOCK_UNTIL: 'tpay_pin_lock_until_v1',
  APP_LOCKED: 'tpay_app_locked_v1',
  CONTACTS: 'contacts',
  FIAT_CURRENCY: 'fiatCurrency',
  FIAT_RATES: 'tpay_fiat_rates_v1',
  PENDING_TXS: 'tpay_pending_txs_v1',
  NOTIFICATION_PREFS: 'tpay_notification_prefs_v1',
  PUSH_TOKEN: 'tpay_push_token_v1',
  SPLIT_BILLS: 'tpay_split_bills_v1',
  PASSPORT_EVENTS: 'tpay_passport_events_v1',
  KEY_ROTATION_WARNING_SEEN: 'tpay_key_rotation_warning_seen_v1',
  KEY_ROTATION_FINDINGS: 'tpay_key_rotation_findings_v1',
  PAYMENT_INTENTS: 'tpay_payment_intents_v1',
  UNIFIED_ACTIVITY: 'tpay_unified_activity_v1',
  BALANCE_CACHE: 'tpay_balance_cache_v1',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

