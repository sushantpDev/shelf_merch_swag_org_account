import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { USER_MANAGEMENT_TOOLS, type Tile } from "../data";
import { shouldOpenCampaignsAfterConnect } from "../userManagementRedirect";
import { HRIS_SYNC_POLL_MS, shouldPollHrisSync, usesHrisAutomaticSyncUi } from "../hrisSyncUi";
import {
  disconnectZoho,
  fetchZohoStatus,
  startZohoConnect,
  formatZohoSyncResult,
  syncZohoEmployees,
  type ZohoConnectionStatus,
  type ZohoIntegrationPublic,
} from "@/services/zoho-api";
import {
  createMergeLinkToken,
  exchangeMergePublicToken,
  fetchMergeConnections,
  disconnectMergeConnection,
  fetchMergeSyncStatus,
  isMergeHrisIntegration,
  syncMergeConnection,
  mergeSyncErrorMessage,
  type MergeConnectionPublic,
  type MergeHrisIntegration,
  type MergeSyncStatusPublic,
} from "@/services/merge-api";
import {
  disconnectSlack,
  fetchSlackChannels,
  fetchSlackConnection,
  sendSlackTestMessage,
  setSlackDefaultChannel,
  startSlackConnect,
  updateSlackNotifications,
  type SlackChannelPublic,
  type SlackConnectionPublic,
  type SlackNotificationPreferences,
} from "@/services/slack-api";
import { canAccessTenantArea } from "@/services/tenant-access";
import { getStoredUser } from "@/services/auth-store";
import { ApiError } from "@/services/api";
import { MERGE_EMPLOYEES_QUERY_KEY } from "../hris-employees/useHrisEmployeesController";

export type IntegrationsVm = {
  selected: Tile | null;
  onSelect: (tile: Tile) => void;
  onBack: () => void;
  onInstall: (tile: Tile) => void;
  onSupport: () => void;
  onViewPlans: () => void;
  mergeLinking: boolean;
  mergeExchanging: boolean;
  mergeLinkToken: string | null;
  mergeLinkProvider: MergeHrisIntegration | null;
  onMergeLinkSuccess: (publicToken: string) => void;
  onMergeLinkExit: () => void;
  mergeSyncingId: string | null;
  mergeDisconnectingId: string | null;
  mergeConnectionsByProvider: Record<string, MergeConnectionPublic>;
  mergeSyncStatus: MergeSyncStatusPublic | null;
  mergeSyncStatusLoading: boolean;
  mergeSyncStatusError: boolean;
  onMergeSync: (connectionId: string) => void;
  onMergeDisconnect: (connectionId: string) => void;
  zoho: {
    status: ZohoConnectionStatus;
    configured: boolean;
    integration: ZohoIntegrationPublic | null;
    loading: boolean;
    syncing: boolean;
    connecting: boolean;
    disconnecting: boolean;
    canManage: boolean;
    onConnect: () => void;
    onSync: () => void;
    onDisconnect: () => void;
  };
  slack: {
    connection: SlackConnectionPublic | null;
    loading: boolean;
    connecting: boolean;
    disconnecting: boolean;
    channels: SlackChannelPublic[];
    channelsLoading: boolean;
    channelsError: string | null;
    savingChannel: boolean;
    sendingTest: boolean;
    savingNotifications: boolean;
    notificationsError: string | null;
    canManage: boolean;
    onConnect: () => void;
    onLoadChannels: () => void;
    onSaveChannel: (channelId: string) => void;
    onSendTest: () => void;
    onDisconnect: () => void;
    onUpdateNotifications: (patch: Partial<SlackNotificationPreferences>) => void;
  };
};

const ZOHO_QUERY_KEY = ["integrations", "zoho", "status"] as const;
const MERGE_QUERY_KEY = ["integrations", "merge", "connections"] as const;
const SLACK_QUERY_KEY = ["integrations", "slack", "connection"] as const;
const SLACK_CHANNELS_QUERY_KEY = ["integrations", "slack", "channels"] as const;

/** Controller for the integrations screen: tile selection + Zoho / Merge actions. */
export function useIntegrationsController(): IntegrationsVm {
  const [selected, setSelected] = useState<Tile | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [slackConnecting, setSlackConnecting] = useState(false);
  const [mergeLinking, setMergeLinking] = useState(false);
  const [mergeExchanging, setMergeExchanging] = useState(false);
  const [mergeLinkToken, setMergeLinkToken] = useState<string | null>(null);
  const [mergeLinkProvider, setMergeLinkProvider] = useState<MergeHrisIntegration | null>(null);
  const pendingMergeIntegration = useRef<MergeHrisIntegration | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = getStoredUser();
  const canManage = canAccessTenantArea(user?.role, "integrations", "write");

  const statusQuery = useQuery({
    queryKey: ZOHO_QUERY_KEY,
    queryFn: fetchZohoStatus,
    staleTime: 30_000,
  });

  const mergeConnectionsQuery = useQuery({
    queryKey: MERGE_QUERY_KEY,
    queryFn: fetchMergeConnections,
    staleTime: 30_000,
  });

  const slackConnectionQuery = useQuery({
    queryKey: SLACK_QUERY_KEY,
    queryFn: fetchSlackConnection,
    staleTime: 30_000,
  });

  const slackConnected =
    slackConnectionQuery.data?.status === "connected" ||
    slackConnectionQuery.data?.status === "needs_attention";

  const slackChannelsQuery = useQuery({
    queryKey: SLACK_CHANNELS_QUERY_KEY,
    queryFn: fetchSlackChannels,
    enabled: Boolean(selected?.id === "slack" && slackConnected && canManage),
    staleTime: 60_000,
    retry: false,
  });

  const mergeConnectionsByProvider = useMemo(() => {
    const map: Record<string, MergeConnectionPublic> = {};
    for (const conn of mergeConnectionsQuery.data ?? []) {
      if (!map[conn.provider]) map[conn.provider] = conn;
    }
    return map;
  }, [mergeConnectionsQuery.data]);

  const selectedConnection =
    selected && isMergeHrisIntegration(selected.id)
      ? mergeConnectionsByProvider[selected.id] ?? null
      : null;
  const pollHrisSync = Boolean(
    selectedConnection &&
      usesHrisAutomaticSyncUi(selectedConnection.provider, selectedConnection.category),
  );

  const syncStatusQuery = useQuery({
    queryKey: ["integrations", "merge", "sync-runs", selectedConnection?.id ?? "none"],
    queryFn: () => fetchMergeSyncStatus(selectedConnection!.id),
    enabled: Boolean(pollHrisSync && selectedConnection?.id),
    staleTime: 0,
    refetchInterval: (query) => {
      if (shouldPollHrisSync(query.state.data)) return HRIS_SYNC_POLL_MS;
      const status = selectedConnection?.lastSyncStatus;
      if (status === "queued" || status === "syncing") return HRIS_SYNC_POLL_MS;
      return false;
    },
  });

  useEffect(() => {
    const data = syncStatusQuery.data;
    if (!data) return;
    queryClient.setQueryData<MergeConnectionPublic[]>(MERGE_QUERY_KEY, (current) => {
      if (!Array.isArray(current)) return current;
      let changed = false;
      const next = current.map((row) => {
        if (row.id !== data.connectionId) return row;
        const lastSyncAt = data.lastSyncAt ?? null;
        const lastError = data.lastError ?? null;
        if (
          row.status === data.connectionStatus &&
          row.lastSyncStatus === data.lastSyncStatus &&
          (row.lastSyncAt ?? null) === lastSyncAt &&
          (row.lastError ?? null) === lastError
        ) {
          return row;
        }
        changed = true;
        return {
          ...row,
          status: data.connectionStatus,
          lastSyncStatus: data.lastSyncStatus,
          lastSyncAt,
          lastError,
        };
      });
      return changed ? next : current;
    });
  }, [syncStatusQuery.data, queryClient]);

  const seenSyncStatus = useRef<string | null>(null);
  useEffect(() => {
    const data = syncStatusQuery.data;
    if (!data) return;
    const key = `${data.connectionId}:${data.lastSyncStatus}:${data.lastSyncFinishedAt ?? ""}`;
    const prev = seenSyncStatus.current;
    seenSyncStatus.current = key;
    if (!prev || !prev.startsWith(`${data.connectionId}:`)) return;
    const prevStatus = prev.split(":")[1];
    if ((prevStatus === "queued" || prevStatus === "syncing") && data.lastSyncStatus === "success") {
      void queryClient.invalidateQueries({ queryKey: MERGE_EMPLOYEES_QUERY_KEY });
    }
  }, [syncStatusQuery.data, queryClient]);

  useEffect(() => {
    const zoho = searchParams.get("zoho");
    if (!zoho) return;
    if (zoho === "connected") {
      toast.success("Zoho People connected");
      void queryClient.invalidateQueries({ queryKey: ZOHO_QUERY_KEY });
      navigate("/app/campaigns", { replace: true });
      return;
    } else if (zoho === "error") {
      const reason = searchParams.get("reason");
      toast.error(
        reason === "denied"
          ? "Zoho People permission was denied"
          : "Could not connect Zoho People",
      );
    }
    const next = new URLSearchParams(searchParams);
    next.delete("zoho");
    next.delete("reason");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, queryClient, navigate]);

  useEffect(() => {
    const slack = searchParams.get("slack");
    if (!slack) return;
    if (slack === "connected") {
      toast.success("Slack connected");
      void queryClient.invalidateQueries({ queryKey: SLACK_QUERY_KEY });
      setSelected({
        id: "slack",
        name: "Slack",
        desc: "Announce gifting activity in Slack.",
      });
    } else if (slack === "cancelled") {
      toast.message("Slack connection cancelled");
    } else if (slack === "error") {
      toast.error("Could not connect Slack");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("slack");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, queryClient]);

  const onMergeLinkSuccess = useCallback(
    async (publicToken: string) => {
      const integration = pendingMergeIntegration.current;
      setMergeLinkToken(null);
      setMergeLinkProvider(null);
      setMergeLinking(false);

      setMergeExchanging(true);
      try {
        const connection = await exchangeMergePublicToken({
          publicToken,
          ...(integration ? { integration } : {}),
        });
        toast.success(
          `${connection.integrationName || connection.provider} connected`,
        );
        queryClient.setQueryData<MergeConnectionPublic[]>(MERGE_QUERY_KEY, (current) => {
          const rows = Array.isArray(current)
            ? current.filter((row) => row.id !== connection.id && row.provider !== connection.provider)
            : [];
          return [connection, ...rows];
        });
        void queryClient.invalidateQueries({ queryKey: MERGE_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: ["integrations", "merge", "sync-runs"] });
        const providerId = integration || connection.provider;
        if (shouldOpenCampaignsAfterConnect(providerId)) {
          navigate("/app/campaigns");
          return;
        }
        const linkedTile = integration
          ? USER_MANAGEMENT_TOOLS.find((tile) => tile.id === integration)
          : null;
        if (linkedTile) setSelected(linkedTile);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not complete Merge connection");
      } finally {
        setMergeExchanging(false);
        pendingMergeIntegration.current = null;
      }
    },
    [queryClient, navigate],
  );

  const onMergeLinkExit = useCallback(() => {
    setMergeLinkToken(null);
    setMergeLinkProvider(null);
    setMergeLinking(false);
    if (!mergeExchanging) {
      pendingMergeIntegration.current = null;
    }
  }, [mergeExchanging]);

  const syncMutation = useMutation({
    mutationFn: syncZohoEmployees,
    onSuccess: (summary) => {
      const message = formatZohoSyncResult(summary);
      if (summary.failed > 0) toast.error(message);
      else toast.success(message);
      void queryClient.invalidateQueries({ queryKey: ZOHO_QUERY_KEY });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Employee sync failed");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectZoho,
    onSuccess: () => {
      toast.success("Zoho People disconnected");
      void queryClient.invalidateQueries({ queryKey: ZOHO_QUERY_KEY });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Disconnect failed");
    },
  });

  const mergeSyncMutation = useMutation({
    mutationFn: syncMergeConnection,
    onSuccess: (result) => {
      toast.success(result.alreadyQueuedOrRunning ? "Sync already in progress" : "Sync queued");
      const rows = queryClient.getQueryData<MergeConnectionPublic[]>(MERGE_QUERY_KEY);
      const row = rows?.find((item) => item.id === result.connectionId);
      queryClient.setQueryData<MergeConnectionPublic[]>(MERGE_QUERY_KEY, (current) => {
        if (!Array.isArray(current)) return current;
        return current.map((item) =>
          item.id === result.connectionId
            ? { ...item, lastSyncStatus: result.syncStatus || "queued", lastError: null }
            : item,
        );
      });
      void queryClient.invalidateQueries({ queryKey: MERGE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["integrations", "merge", "sync-runs"] });
      if (row?.category === "directory") {
        window.setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: MERGE_QUERY_KEY });
          void queryClient.invalidateQueries({ queryKey: MERGE_EMPLOYEES_QUERY_KEY });
        }, 4000);
      }
    },
    onError: (err) => {
      toast.error(mergeSyncErrorMessage(err));
      void queryClient.invalidateQueries({ queryKey: MERGE_QUERY_KEY });
    },
  });

  const mergeDisconnectMutation = useMutation({
    mutationFn: disconnectMergeConnection,
    onSuccess: (connection) => {
      toast.success(
        `${connection.integrationName || connection.provider} disconnected`,
      );
      void queryClient.invalidateQueries({ queryKey: MERGE_QUERY_KEY });
      // Keep imported employees visible in the directory after disconnect.
      void queryClient.invalidateQueries({ queryKey: MERGE_EMPLOYEES_QUERY_KEY });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Disconnect failed");
    },
  });

  const onConnect = useCallback(async () => {
    if (!canManage) {
      toast.error("Admin access required");
      return;
    }
    setConnecting(true);
    try {
      await startZohoConnect();
    } catch (err) {
      setConnecting(false);
      toast.error(err instanceof ApiError ? err.message : "Could not start Zoho connection");
    }
  }, [canManage]);

  const onSlackConnect = useCallback(async () => {
    if (!canManage) {
      toast.error("Admin access required");
      return;
    }
    setSlackConnecting(true);
    try {
      const authorizeUrl = await startSlackConnect();
      window.location.assign(authorizeUrl);
    } catch (err) {
      setSlackConnecting(false);
      toast.error(err instanceof ApiError ? err.message : "Could not start Slack connection");
    }
  }, [canManage]);

  const slackSaveChannelMutation = useMutation({
    mutationFn: setSlackDefaultChannel,
    onSuccess: (connection) => {
      toast.success(
        connection.defaultChannelName
          ? `Default channel set to #${connection.defaultChannelName}`
          : "Default channel updated",
      );
      void queryClient.invalidateQueries({ queryKey: SLACK_QUERY_KEY });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not save channel");
    },
  });

  const slackTestMutation = useMutation({
    mutationFn: () => sendSlackTestMessage(),
    onSuccess: () => {
      const name = queryClient.getQueryData<SlackConnectionPublic | null>(SLACK_QUERY_KEY)
        ?.defaultChannelName;
      toast.success(
        name ? `Test sent to #${name}` : "Test sent to Slack",
      );
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not send test message");
      if (err instanceof ApiError && err.code === "SLACK_AUTH_FAILED") {
        void queryClient.invalidateQueries({ queryKey: SLACK_QUERY_KEY });
      }
    },
  });

  const slackDisconnectMutation = useMutation({
    mutationFn: disconnectSlack,
    onSuccess: () => {
      toast.success("Slack disconnected");
      void queryClient.invalidateQueries({ queryKey: SLACK_QUERY_KEY });
      void queryClient.removeQueries({ queryKey: SLACK_CHANNELS_QUERY_KEY });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Disconnect failed");
    },
  });

  const slackNotificationsMutation = useMutation({
    mutationFn: updateSlackNotifications,
    onSuccess: () => {
      toast.success("Notification preferences saved");
      void queryClient.invalidateQueries({ queryKey: SLACK_QUERY_KEY });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not save preferences");
    },
  });
  const startMergeLink = useCallback(
    async (integration?: MergeHrisIntegration) => {
      if (!canManage) {
        toast.error("Admin access required");
        return;
      }
      if (mergeLinking || mergeExchanging) return;

      // Clear any prior session so iframe/token cannot go stale across provider switches.
      setMergeLinkToken(null);
      setMergeLinkProvider(integration ?? null);
      pendingMergeIntegration.current = integration ?? null;
      setMergeLinking(true);
      try {
        const token = await createMergeLinkToken(
          integration ? { integration } : undefined,
        );
        setMergeLinkToken(token);
      } catch (err) {
        setMergeLinking(false);
        setMergeLinkProvider(null);
        pendingMergeIntegration.current = null;
        toast.error(err instanceof ApiError ? err.message : "Could not start Merge Link");
      }
    },
    [canManage, mergeLinking, mergeExchanging],
  );

  const onInstall = useCallback(
    (tile: Tile) => {
      if (tile.id === "zoho-people") {
        void onConnect();
        return;
      }
      if (tile.id === "slack") {
        void onSlackConnect();
        return;
      }
      if (tile.requiresSetup) {
        toast.message(`Set up ${tile.name} first`);
        return;
      }
      if (isMergeHrisIntegration(tile.id)) {
        const existing = mergeConnectionsByProvider[tile.id];
        if (existing?.status === "connected") {
          toast.message(`${tile.name} already connected`);
          return;
        }
        void startMergeLink(tile.id);
        return;
      }
      toast(`${tile.name} setup started`);
    },
    [onConnect, onSlackConnect, startMergeLink, mergeConnectionsByProvider],
  );

  const status = statusQuery.data?.status ?? "not_connected";

  return {
    selected,
    onSelect: setSelected,
    onBack: () => setSelected(null),
    onInstall,
    onSupport: () => {
      try {
        navigate("/app/support");
      } catch {
        toast.error("Could not open support");
      }
    },
    onViewPlans: () => {
      try {
        navigate("/app/billing");
      } catch {
        toast.error("Could not load plan details");
      }
    },
    mergeLinking,
    mergeExchanging,
    mergeLinkToken,
    mergeLinkProvider,
    onMergeLinkSuccess,
    onMergeLinkExit,
    mergeSyncingId: mergeSyncMutation.isPending
      ? (mergeSyncMutation.variables as string | undefined) || null
      : null,
    mergeDisconnectingId: mergeDisconnectMutation.isPending
      ? (mergeDisconnectMutation.variables as string | undefined) || null
      : null,
    mergeConnectionsByProvider,
    mergeSyncStatus: pollHrisSync ? syncStatusQuery.data ?? null : null,
    mergeSyncStatusLoading: pollHrisSync && syncStatusQuery.isLoading,
    mergeSyncStatusError: pollHrisSync && syncStatusQuery.isError,
    onMergeSync: (connectionId: string) => {
      if (mergeSyncMutation.isPending || mergeDisconnectMutation.isPending) return;
      const existing = Object.values(mergeConnectionsByProvider).find((row) => row.id === connectionId);
      if (existing?.lastSyncStatus === "queued" || existing?.lastSyncStatus === "syncing") return;
      mergeSyncMutation.mutate(connectionId);
    },
    onMergeDisconnect: (connectionId: string) => {
      if (mergeDisconnectMutation.isPending || mergeSyncMutation.isPending) return;
      mergeDisconnectMutation.mutate(connectionId);
    },
    zoho: {
      status,
      configured: statusQuery.data?.configured ?? false,
      integration: statusQuery.data?.integration ?? null,
      loading: statusQuery.isLoading,
      syncing: syncMutation.isPending,
      connecting,
      disconnecting: disconnectMutation.isPending,
      canManage,
      onConnect,
      onSync: () => syncMutation.mutate(),
      onDisconnect: () => disconnectMutation.mutate(),
    },
    slack: {
      connection: slackConnectionQuery.data ?? null,
      loading: slackConnectionQuery.isLoading,
      connecting: slackConnecting,
      disconnecting: slackDisconnectMutation.isPending,
      channels: slackChannelsQuery.data ?? [],
      channelsLoading: slackChannelsQuery.isFetching,
      channelsError:
        slackChannelsQuery.error instanceof ApiError
          ? slackChannelsQuery.error.message
          : slackChannelsQuery.error
            ? "Could not load Slack channels"
            : null,
      savingChannel: slackSaveChannelMutation.isPending,
      sendingTest: slackTestMutation.isPending,
      savingNotifications: slackNotificationsMutation.isPending,
      notificationsError:
        slackNotificationsMutation.error instanceof ApiError
          ? slackNotificationsMutation.error.message
          : slackNotificationsMutation.error
            ? "Could not save preferences"
            : null,
      canManage,
      onConnect: () => {
        void onSlackConnect();
      },
      onLoadChannels: () => {
        void queryClient.invalidateQueries({ queryKey: SLACK_CHANNELS_QUERY_KEY });
      },
      onSaveChannel: (channelId: string) => {
        if (slackSaveChannelMutation.isPending) return;
        slackSaveChannelMutation.mutate(channelId);
      },
      onSendTest: () => {
        if (slackTestMutation.isPending) return;
        slackTestMutation.mutate();
      },
      onDisconnect: () => {
        if (slackDisconnectMutation.isPending) return;
        slackDisconnectMutation.mutate();
      },
      onUpdateNotifications: (patch) => {
        if (slackNotificationsMutation.isPending) return;
        slackNotificationsMutation.mutate(patch);
      },
    },
  };
}
