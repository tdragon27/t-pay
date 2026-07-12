// services/taskEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Task Engine — orchestrates multi-step wallet flows.
// Each task wraps an existing wallet function (sendUSDC / bridgeUSDC / faucet).
// Tasks can be run individually or chained into AutoFlows.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { faucetService, type FaucetResult } from '@/services/faucetService';
import { type BridgeJob } from '@/services/bridgeService';
import { type BridgeChain } from '@/constants/chains';
import { canAutoExecuteWalletTask } from '@/utils/tpayLogic';

// ─── Task types ───────────────────────────────────────────────────────────────

export type TaskType = 'send' | 'bridge' | 'faucet';
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface TaskDefinition {
  id:       string;
  type:     TaskType;
  label:    string;
  // send params
  to?:      string;
  amount?:  string;
  // bridge params
  toChain?: BridgeChain;
  // faucet params
  chainId?: number;
}

export interface TaskRun {
  taskId:    string;
  type:      TaskType;
  label:     string;
  status:    TaskStatus;
  startedAt: number;
  endedAt?:  number;
  result?:   BridgeJob | FaucetResult | { txHash: string };
  error?:    string;
}

export interface FlowRun {
  id:         string;
  name:       string;
  tasks:      TaskRun[];
  status:     'running' | 'success' | 'partial' | 'failed';
  startedAt:  number;
  endedAt?:   number;
  stopOnFail: boolean;
}

export type FlowListener = (flow: FlowRun) => void;

// ─── Built-in flow templates ──────────────────────────────────────────────────

export const FLOW_TEMPLATES: Array<{
  id:    string;
  name:  string;
  icon:  string;
  tasks: Omit<TaskDefinition, 'id'>[];
}> = [
  {
    id:   'faucet_and_send',
    name: 'Claim & Send',
    icon: '💸',
    tasks: [
      { type: 'faucet', label: 'Claim testnet USDC' },
      { type: 'send',   label: 'Send 5 USDC', amount: '5' },
    ],
  },
  {
    id:   'faucet_and_bridge',
    name: 'Claim & Bridge',
    icon: '🌉',
    tasks: [
      { type: 'faucet', label: 'Claim testnet USDC' },
      { type: 'bridge', label: 'Bridge to Base Sepolia', amount: '5' },
    ],
  },
  {
    id:   'full_cycle',
    name: 'Full Cycle',
    icon: '🔄',
    tasks: [
      { type: 'faucet', label: 'Claim testnet USDC' },
      { type: 'send',   label: 'Send 3 USDC', amount: '3' },
      { type: 'bridge', label: 'Bridge 5 USDC', amount: '5' },
    ],
  },
];

// ─── Storage ──────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'tpay_flow_history_v1';

async function saveFlow(flow: FlowRun): Promise<void> {
  try {
    const raw   = await AsyncStorage.getItem(HISTORY_KEY);
    const flows = raw ? (JSON.parse(raw) as FlowRun[]) : [];
    const idx   = flows.findIndex((f) => f.id === flow.id);
    if (idx >= 0) flows[idx] = flow;
    else flows.unshift(flow);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(flows.slice(0, 20)));
  } catch {}
}

// ─── TaskEngine ───────────────────────────────────────────────────────────────

class TaskEngine {
  private listeners: FlowListener[] = [];

  onFlowUpdate(cb: FlowListener): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((x) => x !== cb); };
  }

  private emit(flow: FlowRun) {
    this.listeners.forEach((cb) => cb(flow));
  }

  async getHistory(): Promise<FlowRun[]> {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN: runTask — executes a single task using existing wallet functions
  // ─────────────────────────────────────────────────────────────────────────
  async runTask(
    task:    TaskDefinition,
    address: string,
  ): Promise<TaskRun> {
    const run: TaskRun = {
      taskId:    task.id,
      type:      task.type,
      label:     task.label,
      status:    'running',
      startedAt: Date.now(),
    };

    try {
      if (task.type === 'faucet') {
        // ── Calls faucetService.claimFaucet() ─────────────────────────────
        const result = await faucetService.claimFaucet(
          address,
          task.chainId,
          true,
        );
        run.result = result;
        run.status = result.status === 'success' ? 'success' : result.status === 'opened' ? 'skipped' : 'failed';
        if (result.status !== 'success') run.error = result.error;

      } else if (task.type === 'send') {
        if (!canAutoExecuteWalletTask(task.type)) {
          throw new Error('Send requires individual review and confirmation in T Pay.');
        }

      } else if (task.type === 'bridge') {
        if (!canAutoExecuteWalletTask(task.type)) {
          throw new Error('Bridge requires individual review and confirmation in T Pay.');
        }
      }

    } catch (e: any) {
      run.status = 'failed';
      run.error  = e?.message ?? 'Task failed';
    }

    run.endedAt = Date.now();
    return run;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN: runFlow — chains multiple tasks with status broadcasting
  // ─────────────────────────────────────────────────────────────────────────
  async runFlow(
    name:       string,
    tasks:      TaskDefinition[],
    address:    string,
    stopOnFail: boolean = false,
  ): Promise<FlowRun> {
    const flow: FlowRun = {
      id:         `flow_${Date.now()}`,
      name,
      tasks:      tasks.map((t) => ({
        taskId:    t.id,
        type:      t.type,
        label:     t.label,
        status:    'pending',
        startedAt: 0,
      })),
      status:     'running',
      startedAt:  Date.now(),
      stopOnFail,
    };

    this.emit(flow);
    await saveFlow(flow);

    let anyFailed = false;

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      // Mark as running
      flow.tasks[i].status    = 'running';
      flow.tasks[i].startedAt = Date.now();
      this.emit({ ...flow });

      if (anyFailed && stopOnFail) {
        flow.tasks[i].status = 'skipped';
        continue;
      }

      const run = await this.runTask(task, address);

      // Merge result back into flow
      flow.tasks[i] = { ...flow.tasks[i], ...run };
      if (run.status === 'failed') anyFailed = true;

      this.emit({ ...flow });
      await saveFlow({ ...flow });
    }

    flow.status  = anyFailed
      ? (flow.tasks.every((t) => t.status === 'failed') ? 'failed' : 'partial')
      : 'success';
    flow.endedAt = Date.now();

    this.emit(flow);
    await saveFlow(flow);
    return flow;
  }

  // Build tasks from a template (fills in required params)
  buildFromTemplate(
    templateId: string,
    params: { to?: string; toChain?: BridgeChain } = {},
  ): TaskDefinition[] {
    const tpl = FLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return [];
    return tpl.tasks.map((t, i) => ({
      ...t,
      id:      `${templateId}_task_${i}`,
      to:      t.type === 'send'   ? params.to      : undefined,
      toChain: t.type === 'bridge' ? params.toChain : undefined,
    }));
  }
}

export const taskEngine = new TaskEngine();