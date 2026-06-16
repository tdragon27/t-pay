// app/autoflow.tsx
// -----------------------------------------------------------------------------
// AutoFlow screen ? one-tap multi-step wallet flows using the Task Engine.
// Supports: built-in templates + custom flows. Shows real-time step status.
// -----------------------------------------------------------------------------

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { useWalletStore } from '@/store/walletStore';
import {
  taskEngine, FLOW_TEMPLATES,
  type FlowRun, type TaskRun, type TaskDefinition,
} from '@/services/taskEngine';
import { BRIDGE_CHAINS } from '@/constants/chains';
import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';

// --- Helpers ------------------------------------------------------------------

const STATUS_COLOR: Record<string, string> = {
  pending: Colors.text3,
  running: Colors.primary,
  success: Colors.success,
  failed:  Colors.error,
  skipped: Colors.muted,
};

const STATUS_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  pending: 'ellipse-outline',
  running: 'sync-outline',
  success: 'checkmark-circle',
  failed:  'close-circle',
  skipped: 'remove-circle-outline',
};

function durationLabel(ms: number): string {
  if (ms < 1000)  return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

// --- Live plan panel ---------------------------------------------------------

function PlanPreview({ tasks }: { tasks: TaskDefinition[] }) {
  if (tasks.length === 0) return null;
  return (
    <View style={styles.simCard}>
      <View style={styles.simHeader}>
        <Ionicons name="shield-checkmark-outline" size={16} color={Colors.warning} />
        <Text style={styles.simTitle}>Live Execution Plan</Text>
      </View>
      {tasks.map((task, i) => (
        <View key={task.id ?? i} style={styles.simRow}>
          <Text style={styles.simStep}>Step {i + 1}</Text>
          <View style={styles.simDelta}>
            <Text style={[styles.simDeltaText, { color: Colors.text1 }]}>{task.label}</Text>
          </View>
          <Text style={styles.simWarn}>
            {task.type === 'faucet'
              ? 'Opens the official Circle Faucet; success is confirmed only after an on-chain transfer appears.'
              : task.type === 'bridge'
                ? 'Executes through Circle App Kit bridge on Arc Testnet.'
                : 'Executes a real USDC transfer through App Kit Send.'}
          </Text>
        </View>
      ))}
    </View>
  );
}
function TaskStepRow({ task, index: _index }: { task: TaskRun; index: number }) {
  const color    = STATUS_COLOR[task.status] ?? Colors.text3;
  const iconName = STATUS_ICON[task.status]  ?? 'ellipse-outline';
  const duration = task.endedAt && task.startedAt
    ? durationLabel(task.endedAt - task.startedAt)
    : null;

  return (
    <View style={styles.stepRow}>
      {/* Left: index line */}
      <View style={styles.stepLeft}>
        <View style={[styles.stepDot, { borderColor: color, backgroundColor: task.status === 'success' ? color : 'transparent' }]}>
          {task.status === 'running'
            ? <ActivityIndicator size="small" color={color} />
            : <Ionicons name={iconName} size={14} color={task.status === 'success' ? Colors.bg : color} />
          }
        </View>
      </View>

      {/* Content */}
      <View style={styles.stepContent}>
        <Text style={[styles.stepLabel, { color }]}>{task.label}</Text>
        {task.error ? (
          <Text style={styles.stepError}>{task.error}</Text>
        ) : duration ? (
          <Text style={styles.stepDuration}>Completed in {duration}</Text>
        ) : null}
      </View>

      {/* Status badge */}
      <View style={[styles.stepBadge, { borderColor: color + '40', backgroundColor: color + '12' }]}>
        <Text style={[styles.stepBadgeText, { color }]}>{task.status}</Text>
      </View>
    </View>
  );
}

// --- Template card ------------------------------------------------------------

function TemplateCard({ tpl, onRun, isRunning }: {
  tpl: typeof FLOW_TEMPLATES[0];
  onRun: (id: string) => void;
  isRunning: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.templateCard}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onRun(tpl.id); }}
      disabled={isRunning}
      activeOpacity={0.75}
    >
      <Text style={styles.templateEmoji}>{tpl.icon}</Text>
      <View style={styles.templateMeta}>
        <Text style={styles.templateName}>{tpl.name}</Text>
        <Text style={styles.templateSteps}>{tpl.tasks.length} steps</Text>
      </View>
      <View style={styles.templateActions}>
        {tpl.tasks.map((t, i) => (
          <View key={i} style={[styles.templateTag, { backgroundColor: t.type === 'faucet' ? '#8B79FF20' : t.type === 'bridge' ? '#FFB54720' : '#00D4FF20' }]}>
            <Text style={[styles.templateTagText, { color: t.type === 'faucet' ? '#8B79FF' : t.type === 'bridge' ? '#FFB547' : Colors.primary }]}>
              {t.type}
            </Text>
          </View>
        ))}
      </View>
      <Ionicons name="play-circle" size={28} color={isRunning ? Colors.muted : Colors.primary} />
    </TouchableOpacity>
  );
}

// --- Main Screen --------------------------------------------------------------

export default function AutoFlowScreen() {
  const router  = useRouter();
  const { address } = useWalletStore();

  const [activeFlow, setActiveFlow]   = useState<FlowRun | null>(null);
  const [planTasks, setPlanTasks] = useState<TaskDefinition[]>([]);
  const [history, setHistory]         = useState<FlowRun[]>([]);


  const isRunning = activeFlow?.status === 'running';

  // Load history on mount
  useEffect(() => {
    taskEngine.getHistory().then(setHistory);
  }, []);

  // Subscribe to live flow updates
  useEffect(() => {
    return taskEngine.onFlowUpdate((flow) => {
      setActiveFlow({ ...flow });
      if (flow.status !== 'running') {
        taskEngine.getHistory().then(setHistory);
      }
    });
  }, []);

  // Build a live execution plan when a template is selected
  const handlePlan = useCallback(async (tplId: string) => {
    if (!address) return;
    const tasks = taskEngine.buildFromTemplate(tplId, {
      toChain: BRIDGE_CHAINS[0],
      to:      address,
    });

    setPlanTasks(tasks);
  }, [address]);
  // Run a template
  const handleRun = useCallback(async (tplId: string) => {
    if (!address || isRunning) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    const tpl = FLOW_TEMPLATES.find((t) => t.id === tplId)!;
    const tasks = taskEngine.buildFromTemplate(tplId, {
      toChain: BRIDGE_CHAINS[0],
      to:      address,
    });

    setActiveFlow({
      id:         `flow_starting`,
      name:       tpl.name,
      tasks:      tasks.map((t, _i) => ({ taskId: t.id, type: t.type, label: t.label, status: 'pending', startedAt: 0 })),
      status:     'running',
      startedAt:  Date.now(),
      stopOnFail: false,
    });

    await taskEngine.runFlow(tpl.name, tasks, address, false);
  }, [address, isRunning]);

  // -- Render ---------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 4, right: 20 }}>
          <Ionicons name="close" size={24} color={Colors.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AutoFlow</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>v1.1</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Description */}
        <Text style={styles.desc}>
          One-tap multi-step flows. Each step calls the real wallet functions ? send, bridge, or claim faucet.
        </Text>

        {/* Active flow */}
        {activeFlow && (
          <View style={styles.activeCard}>
            <View style={styles.activeHeader}>
              <LinearGradient colors={[Colors.primaryGlow, 'transparent']} style={StyleSheet.absoluteFill} />
              <View style={styles.activeHeaderRow}>
                {isRunning
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Ionicons name="checkmark-circle" size={20} color={activeFlow.status === 'success' ? Colors.success : Colors.error} />
                }
                <Text style={styles.activeTitle}>{activeFlow.name}</Text>
                <Text style={[styles.activeStatus, { color: isRunning ? Colors.primary : activeFlow.status === 'success' ? Colors.success : Colors.error }]}>
                  {activeFlow.status}
                </Text>
              </View>
            </View>

            <View style={styles.stepsWrap}>
              {activeFlow.tasks.map((task, i) => (
                <TaskStepRow key={task.taskId + i} task={task} index={i} />
              ))}
            </View>
          </View>
        )}

        {/* Live execution plan */}
        <PlanPreview tasks={planTasks} />
        {/* Templates */}
        <Text style={styles.sectionTitle}>Flow Templates</Text>
        {FLOW_TEMPLATES.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            tpl={tpl}
            isRunning={isRunning}
            onRun={async (id) => {
              await handlePlan(id);
              await handleRun(id);
            }}
          />
        ))}

        {/* Recent history */}
        {history.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Recent Flows</Text>
            <View style={styles.historyCard}>
              {history.slice(0, 5).map((flow, i) => (
                <View key={flow.id} style={[styles.historyRow, i < 4 && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyName}>{flow.name}</Text>
                    <Text style={styles.historyTime}>{new Date(flow.startedAt).toLocaleString()}</Text>
                  </View>
                  <View style={[styles.historyBadge, { backgroundColor: flow.status === 'success' ? Colors.successBg : Colors.errorBg }]}>
                    <Text style={[styles.historyBadgeText, { color: flow.status === 'success' ? Colors.success : Colors.error }]}>
                      {flow.status}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: Platform.OS === 'ios' ? 48 : 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
  closeBtn:{ padding: 8 },
  headerTitle: { fontWeight: '700', fontSize: FontSize.lg, color: Colors.text1, flex: 1 },
  headerBadge: { backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primaryDim, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  headerBadgeText: { fontFamily: 'SpaceMono-Regular', fontSize: 10, color: Colors.primary },
  scroll:  { padding: Spacing.md, gap: 0 },
  desc:    { fontSize: FontSize.sm, color: Colors.text2, lineHeight: 20, marginBottom: Spacing.md },

  // Active flow
  activeCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.md },
  activeHeader: { padding: Spacing.md, position: 'relative' },
  activeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeTitle:  { fontWeight: '700', fontSize: FontSize.md, color: Colors.text1, flex: 1 },
  activeStatus: { fontWeight: '700', fontSize: FontSize.sm, textTransform: 'capitalize' },
  stepsWrap:    { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: 12 },

  // Step row
  stepRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepLeft:     { alignItems: 'center', paddingTop: 2 },
  stepDot:      { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepContent:  { flex: 1, gap: 2 },
  stepLabel:    { fontWeight: '700', fontSize: FontSize.sm },
  stepError:    { fontSize: FontSize.xs, color: Colors.error },
  stepDuration: { fontSize: FontSize.xs, color: Colors.text3 },
  stepBadge:    { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  stepBadgeText:{ fontFamily: 'SpaceMono-Regular', fontSize: 10, textTransform: 'capitalize' },

  // Sim
  simCard:    { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.warning + '40', padding: Spacing.md, marginBottom: Spacing.md, gap: 10 },
  simHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  simTitle:   { fontWeight: '700', fontSize: FontSize.sm, color: Colors.warning },
  simRow:     { gap: 3 },
  simStep:    { fontSize: FontSize.xs, color: Colors.text3 },
  simDelta:   {},
  simDeltaText:{ fontWeight: '700', fontSize: FontSize.md },
  simWarn:    { fontSize: FontSize.xs, color: Colors.warning },
  simLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.sm, marginBottom: Spacing.md },
  simLoadingText: { fontSize: FontSize.sm, color: Colors.warning },

  // Templates
  sectionTitle: { fontWeight: '700', fontSize: FontSize.md, color: Colors.text1, marginBottom: 10 },
  templateCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10 },
  templateEmoji:{ fontSize: 28 },
  templateMeta: { flex: 1, gap: 2 },
  templateName: { fontWeight: '700', fontSize: FontSize.md, color: Colors.text1 },
  templateSteps:{ fontSize: FontSize.xs, color: Colors.text3 },
  templateActions:{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', maxWidth: 120 },
  templateTag:  { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  templateTagText:{ fontFamily: 'SpaceMono-Regular', fontSize: 9, textTransform: 'capitalize' },

  // History
  historyCard:  { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  historyRow:   { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  historyLeft:  { flex: 1, gap: 2 },
  historyName:  { fontWeight: '700', fontSize: FontSize.sm, color: Colors.text1 },
  historyTime:  { fontSize: FontSize.xs, color: Colors.text3 },
  historyBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  historyBadgeText: { fontWeight: '700', fontSize: FontSize.xs, textTransform: 'capitalize' },
});



