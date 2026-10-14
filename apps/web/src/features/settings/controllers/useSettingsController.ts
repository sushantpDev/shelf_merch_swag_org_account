import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useInvalidateWorkspace, useWorkspace } from "@/hooks/useWorkspace";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { ApiError } from "@/services/api";
import {
  fileTypeFromName,
  getDefaultArtwork,
  setDefaultArtwork,
} from "@/features/swag/wizard/artworkHistory";
import {
  getStoredUser,
  updateWorkspaceSettingsApi,
  uploadWorkspaceLogoApi,
} from "../model";
import type { WorkspaceOwner } from "../model";

export type SettingsTab = "workspace" | "sso";

const LOGO_ACCEPT = /\.(svg|png|webp|jpe?g)$/i;
const LOGO_MAX = 5 * 1024 * 1024;

async function withGatewayRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 0;
    if (status !== 502 && status !== 503 && status !== 504) throw err;
    await new Promise((resolve) => setTimeout(resolve, 800));
    return run();
  }
}

export type SettingsVm = {
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  // workspace form
  name: string;
  slug: string;
  logoUrl: string;
  isSaving: boolean;
  isUploading: boolean;
  canEditWorkspace: boolean;
  displayOwner: WorkspaceOwner | undefined;
  isCurrentOwner: boolean;
  transferOpen: boolean;
  onName: (name: string) => void;
  onSlug: (slug: string) => void;
  onPickLogo: (file: File) => void;
  onSave: () => void;
  onTransferOpenChange: (open: boolean) => void;
  onChangeCurrency: () => void;
  // sso section demo actions
  onSsoLearnMore: () => void;
  onSsoContact: () => void;
};

/** Controller for the settings screen: tabs, workspace form, ownership. */
export function useSettingsController(): SettingsVm {
  const { data: workspace } = useWorkspace();
  const invalidateWorkspace = useInvalidateWorkspace();
  const { canWrite } = useTenantAccess();
  const canEditWorkspace = canWrite("settings");

  const account = workspace?.account ?? "";
  const savedLogoUrl = workspace?.logoUrl ?? "";
  const owner = workspace?.owner;
  const userId = getStoredUser()?.id;
  const userPatch = workspace?.userPatch;

  const [tab, setTab] = useState<SettingsTab>("workspace");
  const [name, setName] = useState(account);
  const [logoUrl, setLogoUrl] = useState(savedLogoUrl);
  const [slug, setSlug] = useState(account.toLowerCase());
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const navigate = useNavigate();

  const displayOwner: WorkspaceOwner | undefined =
    owner ??
    (userId && userPatch
      ? { id: userId, name: userPatch.name, email: userPatch.email }
      : undefined);
  const isCurrentOwner = Boolean(displayOwner && userId && displayOwner.id === userId);

  // Keep local fields in sync once the workspace snapshot resolves.
  useEffect(() => {
    setName(account);
    setSlug(account.toLowerCase());
    setLogoUrl(savedLogoUrl);
  }, [account, savedLogoUrl]);

  async function onPickLogo(file: File) {
    if (!LOGO_ACCEPT.test(file.name)) {
      toast.error("Use SVG, PNG, WEBP, or JPG");
      return;
    }
    if (file.size > LOGO_MAX) {
      toast.error("Maximum file size is 5 MB");
      return;
    }

    setIsUploading(true);
    try {
      const uploadedLogoUrl = await withGatewayRetry(() => uploadWorkspaceLogoApi(file));
      await withGatewayRetry(() => updateWorkspaceSettingsApi({ logoUrl: uploadedLogoUrl }));
      setLogoUrl(uploadedLogoUrl);
      const currentDefault = getDefaultArtwork();
      if (!currentDefault || currentDefault.source === "workspace-logo") {
        setDefaultArtwork({
          id: "workspace-logo",
          name: file.name || "Workspace Logo",
          preview: uploadedLogoUrl,
          fileType: fileTypeFromName(file.name),
          source: "workspace-logo",
        });
      }
      await invalidateWorkspace();
      toast.success("Workspace icon updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update workspace icon");
    } finally {
      setIsUploading(false);
    }
  }

  async function onSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Enter a workspace name");
      return;
    }

    setIsSaving(true);
    try {
      await updateWorkspaceSettingsApi({ name: trimmedName, logoUrl });
      setName(trimmedName);
      await invalidateWorkspace();
      toast.success("Workspace settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save workspace settings");
    } finally {
      setIsSaving(false);
    }
  }

  return {
    tab,
    onTab: setTab,
    name,
    slug,
    logoUrl,
    isSaving,
    isUploading,
    canEditWorkspace,
    displayOwner,
    isCurrentOwner,
    transferOpen,
    onName: setName,
    onSlug: setSlug,
    onPickLogo,
    onSave,
    onTransferOpenChange: setTransferOpen,
    onChangeCurrency: () => {
      // Currency selector is not available yet.
    },
    onSsoLearnMore: () => {
      const opened = window.open(
        "https://account.shelfmerch.io/saml/metadata",
        "_blank",
        "noopener,noreferrer",
      );
      if (!opened) toast.error("Could not open SSO documentation");
    },
    onSsoContact: () => {
      try {
        navigate("/app/support");
      } catch {
        toast.error("Could not open support");
      }
    },
  };
}
