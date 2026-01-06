/**
 * useServerStatus Hook
 *
 * Polls the /server-status endpoint every 2 seconds to monitor
 * server processing and queue status.
 */

import { useEffect, useCallback } from 'react';
import { useASRStore } from '@/stores/asrStore';
import type { ServerStatus } from '@/stores/asrStore';

const POLL_INTERVAL = 2000; // 2 seconds

export interface ServerStatusResponse {
  total_active: number;
  basic: {
    processing: number;
    waiting: number;
  };
  advanced: {
    processing: number;
    waiting: number;
  };
}

/**
 * Fetch server status from API
 */
async function fetchServerStatus(): Promise<ServerStatus | null> {
  try {
    const response = await fetch('/server-status');

    if (!response.ok) {
      console.error('Server status error:', response.status);
      return null;
    }

    const data: ServerStatusResponse = await response.json();

    // Aggregate status from both models
    const totalWaiting = data.basic.waiting + data.advanced.waiting;
    const totalProcessing = data.basic.processing + data.advanced.processing;

    return {
      waiting: totalWaiting,
      processing: totalProcessing,
    };
  } catch (e) {
    // Network error or server not available
    console.error('Failed to fetch server status:', e);
    return null;
  }
}

/**
 * useServerStatus Hook
 *
 * Automatically polls server status and updates asrStore
 */
export const useServerStatus = (enabled: boolean = true) => {
  const { setServerStatus } = useASRStore();

  const updateStatus = useCallback(async () => {
    const status = await fetchServerStatus();
    setServerStatus(status);
  }, [setServerStatus]);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    updateStatus();

    // Setup polling interval
    const intervalId = setInterval(updateStatus, POLL_INTERVAL);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, updateStatus]);

  return {
    updateStatus,
  };
};
