import { useState, useEffect, useCallback, useRef } from 'react';
import { InfringementForm } from './components/InfringementForm';
import { InfringementLog } from './components/InfringementLog';
import { PendingPenalties } from './components/PendingPenalties';
import { EditInfringementDialog } from './components/EditInfringementDialog';
import { SessionManager } from './components/SessionManager';
import { CheckeredFlag } from './components/CheckeredFlag';
import { RacelithLogo } from './components/RacelithLogo';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Switch } from './components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './components/ui/dialog';
import { AlertCircle, Wifi, WifiOff, Settings } from 'lucide-react';
import { toast } from 'sonner';
import {
  API_BASE,
  setRequestSession,
  PartialSubmissionError,
  applyIndividualPenalty,
  createInfringement,
  deleteInfringement,
  fetchInfringements,
  fetchPendingPenalties,
  getSessionConfig,
  updateInfringement as updateInfringementApi,
  listSessions,
  getConfig,
  updateConfig,
  updateSessionConfig,
} from './api';
import { wsManager } from './websocket';
import type {
  CreateInfringementPayload,
  InfringementRecord,
  PendingPenalty,
  UpdateInfringementPayload,
  PaginatedInfringements,
} from './api';

const DEFAULT_PERFORMED_BY = 'Race Control Operator';

type View = 'sessions' | 'penalty-logging';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('sessions');
  const [activeSessionName, setActiveSessionName] = useState<string | null>(null);
  const [infringements, setInfringements] = useState<InfringementRecord[]>([]);
  const [pendingPenalties, setPendingPenalties] = useState<PendingPenalty[]>([]);
  const [editingInfringement, setEditingInfringement] = useState<InfringementRecord | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplyingPenalty, setIsApplyingPenalty] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [warningExpiryMinutes, setWarningExpiryMinutes] = useState<number>(180);
  const [showExpirySettings, setShowExpirySettings] = useState<boolean>(false);
  const [isQualifyingMode, setIsQualifyingMode] = useState<boolean>(false);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [isSavingSessionConfig, setIsSavingSessionConfig] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [searchKart, setSearchKart] = useState('');
  const loadGeneration = useRef(0);
  const [paginationPage, setPaginationPage] = useState<number>(1);
  const [paginationLimit, setPaginationLimit] = useState<number>(300);
  const [paginationTotal, setPaginationTotal] = useState<number>(0);
  const [paginationTotalPages, setPaginationTotalPages] = useState<number>(1);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState<number>(0);
  const popupWindowRef = useRef<Window | null>(null);
  const activeSessionNameRef = useRef<string | null>(null);

  useEffect(() => {
    activeSessionNameRef.current = activeSessionName;
  }, [activeSessionName]);

  // Fetch config from backend on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await getConfig();
        setWarningExpiryMinutes(config.warning_expiry_minutes);
      } catch (error) {
        console.error('Failed to fetch config, using default:', error);
        // Keep default value of 180
      }
    };
    fetchConfig();
  }, []);

  const checkActiveSession = useCallback(async (generation?: number) => {
    try {
      const response = await listSessions();
      const activeSession = response.sessions.find((s) => s.status === 'active');
      const hasActive = !!activeSession;
      if (generation !== undefined && generation !== loadGeneration.current) return { hasActive, sessionName: activeSession?.name ?? null };
      setHasActiveSession(hasActive);
      setRequestSession(activeSession?.name ?? null);
      setActiveSessionName(activeSession?.name ?? null);
      return { hasActive, sessionName: activeSession?.name || null };
    } catch (error) {
      console.error('Failed to check active session', error);
      return { hasActive: false, sessionName: null };
    }
  }, []);

  const loadSessionConfig = useCallback(async (sessionName: string) => {
    try {
      const config = await getSessionConfig(sessionName);
      setIsQualifyingMode(config.qualifying_mode);
    } catch (error) {
      console.error('Failed to fetch session config', error);
      setIsQualifyingMode(false);
    }
  }, []);

  const loadData = useCallback(
    async (withSpinner = true) => {
      if (withSpinner) {
        setIsLoading(true);
        setLoadError(null);
      }
      const generation = ++loadGeneration.current;
      try {
        // First check if there's an active session
        const { hasActive } = await checkActiveSession(generation);
        if (generation !== loadGeneration.current) return;
        
        if (!hasActive) {
          setHasActiveSession(false);
          setInfringements([]);
          setPendingPenalties([]);
          setIsQualifyingMode(false);
          if (withSpinner) {
            setLoadError('No active session. Please create or load a session to view infringements.');
          }
          return;
        }

        setHasActiveSession(true);
        const [infringementData, pendingData] = await Promise.all([
          fetchInfringements(paginationPage, paginationLimit, searchKart),
          fetchPendingPenalties(),
        ]);
        if (generation !== loadGeneration.current) return;
        if (infringementData.page !== paginationPage) setPaginationPage(infringementData.page);
        if (infringementData.server_time_utc) {
          setServerTimeOffsetMs(new Date(infringementData.server_time_utc).getTime() - Date.now());
        }
        setInfringements(infringementData.items);
        setPaginationTotal(infringementData.total);
        setPaginationTotalPages(infringementData.total_pages);
        setPendingPenalties(pendingData);
        setLoadError(null);
      } catch (error: any) {
        if (generation !== loadGeneration.current) return;
        console.error('Failed to load data', error);
        const errorMessage = error?.message || 'Failed to load data from server';
        setLoadError(errorMessage);
        
        // Check if it's a database/table error (likely no session active)
        if (errorMessage.includes('relation') || errorMessage.includes('does not exist') || errorMessage.includes('table')) {
          setHasActiveSession(false);
          toast.error('Database Error', {
            description: 'No active session found. Please create or load a session first.',
          });
        } else {
          toast.error('Error Loading Data', {
            description: errorMessage,
          });
        }
      } finally {
        if (generation === loadGeneration.current) setIsLoading(false);
      }
    },
    [checkActiveSession, paginationPage, paginationLimit, searchKart]
  );

  // Check for active session on mount and navigate if exists
  useEffect(() => {
    const checkAndNavigate = async () => {
      const { hasActive, sessionName } = await checkActiveSession();
      if (hasActive && sessionName) {
        setCurrentView('penalty-logging');
        setActiveSessionName(sessionName);
      }
    };
    void checkAndNavigate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only load data when in penalty-logging view
  useEffect(() => {
    if (currentView === 'penalty-logging') {
      void loadData();
    }
  }, [currentView, loadData]);

  const latestLoadData = useRef(loadData);
  latestLoadData.current = loadData;

  // WebSocket connection for real-time updates
  useEffect(() => {
    // Check connection status periodically
    const checkStatus = () => {
      setWsConnected(wsManager.isConnected());
    };
    const statusInterval = setInterval(checkStatus, 1000);
    checkStatus(); // Initial check

    const unsubscribe = wsManager.subscribe((message) => {
      setWsConnected(wsManager.isConnected());
      const relevantTypes = new Set([
        'new_infringement',
        'update_infringement',
        'delete_infringement',
        'penalty_applied',
        'session_started',
        'session_loaded',
        'session_closed',
        'session_deleted',
        'session_imported',
      ]);
      if (message?.type === 'connected') void latestLoadData.current(false);
      if (message?.type && relevantTypes.has(message.type)) {
        // Use loadData from closure - don't include in dependencies to prevent reconnections
        void latestLoadData.current(false);
      }
      if (message?.type === 'config_updated') {
        const nextExpiry = Number(message.data?.warning_expiry_minutes);
        if (Number.isFinite(nextExpiry) && nextExpiry >= 1) {
          setWarningExpiryMinutes(nextExpiry);
        }
      }
      if (message?.type === 'session_config_updated') {
        const sessionName = message.session?.name;
        if (sessionName && sessionName === activeSessionNameRef.current) {
          setIsQualifyingMode(Boolean(message.data?.qualifying_mode));
        }
      }
    });

    return () => {
      clearInterval(statusInterval);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - connection should persist regardless of loadData changes

  useEffect(() => {
    if (currentView === 'penalty-logging' && activeSessionName) {
      void loadSessionConfig(activeSessionName);
    } else if (currentView === 'sessions') {
      setIsQualifyingMode(false);
    }
  }, [activeSessionName, currentView, loadSessionConfig]);

  // Listen for messages from popup windows (for edit/delete actions)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popupWindowRef.current) return;
      if (event.data?.type === 'editInfringement') {
        const infringement = infringements.find(inf => inf.id === event.data.id);
        if (infringement) {
          setEditingInfringement(infringement);
          setEditDialogOpen(true);
        }
      } else if (event.data?.type === 'updateInfringement') {
        // Popup updated an infringement, reload data to reflect changes
        await loadData(false);
      } else if (event.data?.type === 'deleteInfringement') {
        // The popup performed its own deletion; refresh without deleting twice.
        await loadData(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [infringements, loadData, deleteInfringement]);

  const handleNewInfringement = async (payloads: CreateInfringementPayload[]) => {
    const remaining: CreateInfringementPayload[] = [];
    let saved = 0;
    let lastError = '';
    for (const payload of payloads) {
      try {
        await createInfringement({ ...payload, session_name: payload.session_name ?? activeSessionNameRef.current,
          performed_by: payload.performed_by || DEFAULT_PERFORMED_BY });
        saved++;
      } catch (error: any) { remaining.push(payload); lastError = error?.message || 'Save failed'; }
    }
    if (saved) {
      setPaginationPage(1);
      await latestLoadData.current(false);
    }
    if (remaining.length) {
      const message = `${saved} saved; ${remaining.length} not saved. ${lastError}`;
      toast.error('Could not save all infringements', { description: message });
      throw new PartialSubmissionError(message, remaining);
    }
    toast.success(`${saved} infringement${saved === 1 ? '' : 's'} saved`);
  };

  const handleApplyPenalty = async (id: number) => {
    try {
      setIsApplyingPenalty(true);
      const pending = pendingPenalties.find(p => p.id === id);
      await applyIndividualPenalty(id, DEFAULT_PERFORMED_BY, pending?.session_name || activeSessionName || undefined);
      await loadData();
      toast.success('Penalty applied successfully');
      // Notify popup window
      if (popupWindowRef.current && !popupWindowRef.current.closed) {
        popupWindowRef.current.postMessage({ type: 'updateInfringements' }, '*');
      }
    } catch (error: any) {
      console.error('Failed to apply penalty', error);
      toast.error('Error Applying Penalty', {
        description: error?.message || 'Failed to apply penalty',
      });
    } finally {
      setIsApplyingPenalty(false);
    }
  };

  const handleEditInfringement = (infringement: InfringementRecord) => {
    setEditingInfringement(infringement);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async (id: number, payload: UpdateInfringementPayload) => {
    try {
      setIsSavingEdit(true);
      const updated = await updateInfringementApi(id, {
        ...payload,
        session_name: editingInfringement?.session_name ?? activeSessionNameRef.current,
        performed_by: payload.performed_by || DEFAULT_PERFORMED_BY,
      });
    setInfringements((prev) =>
        prev.map((inf) => (inf.id === updated.id ? updated : inf))
      );
      const pending = await fetchPendingPenalties();
      setPendingPenalties(pending);
      await latestLoadData.current(false);
      toast.success('Infringement updated successfully');
      // Notify popup window
      if (popupWindowRef.current && !popupWindowRef.current.closed) {
        popupWindowRef.current.postMessage({ type: 'updateInfringements' }, '*');
      }
    } catch (error: any) {
      console.error('Failed to update infringement', error);
      toast.error('Error Updating Infringement', {
        description: error?.message || 'Failed to update infringement',
      });
      throw error;
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteInfringement = async (id: number, options: { skipConfirm?: boolean } = {}) => {
    if (!options.skipConfirm) {
      const confirmed = window.confirm('Are you sure you want to delete this infringement?');
      if (!confirmed) return;
    }

    try {
      await deleteInfringement(id, infringements.find(i => i.id === id)?.session_name);
      setInfringements((prev) => prev.filter((inf) => inf.id !== id));
      setPendingPenalties((prev) => prev.filter((penalty) => penalty.id !== id));
      await latestLoadData.current(false);
      toast.success('Infringement deleted successfully');
      // Notify popup window
      if (popupWindowRef.current && !popupWindowRef.current.closed) {
        popupWindowRef.current.postMessage({ type: 'updateInfringements' }, '*');
      }
    } catch (error: any) {
      console.error('Failed to delete infringement', error);
      toast.error('Error Deleting Infringement', {
        description: error?.message || 'Failed to delete infringement',
      });
    }
  };

  const handleSessionSelected = (sessionName: string) => {
    setActiveSessionName(sessionName);
    setCurrentView('penalty-logging');
  };

  const handleSessionCreatedOrLoaded = (sessionName: string) => {
    setActiveSessionName(sessionName);
    setCurrentView('penalty-logging');
    void loadData();
  };

  const handleBackToSessions = () => {
    setCurrentView('sessions');
    setActiveSessionName(null);
    setIsQualifyingMode(false);
  };

  const handlePageChange = (newPage: number) => {
    setPaginationPage(newPage);
  };

  const handlePageSizeChange = (newLimit: number) => {
    setPaginationLimit(newLimit);
    setPaginationPage(1); // Reset to first page when changing page size
  };

  const handleSaveExpiryMinutes = async () => {
    try {
      setIsSavingConfig(true);
      await updateConfig({ warning_expiry_minutes: warningExpiryMinutes });
      toast.success('Warning expiry minutes updated successfully');
    } catch (error: any) {
      console.error('Failed to update config', error);
      toast.error('Error Updating Config', {
        description: error?.message || 'Failed to update warning expiry minutes',
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleToggleExpirySettings = (checked: boolean) => {
    if (checked) {
      // User wants to turn it on - require password
      setPasswordDialogOpen(true);
    } else {
      // User wants to turn it off - no password needed
      setShowExpirySettings(false);
    }
  };

  const handleToggleQualifyingMode = async () => {
    if (!activeSessionName) {
      return;
    }

    const sessionName = activeSessionName;
    const nextQualifyingMode = !isQualifyingMode;
    setIsQualifyingMode(nextQualifyingMode);

    try {
      setIsSavingSessionConfig(true);
      await updateSessionConfig(sessionName, { qualifying_mode: nextQualifyingMode });
    } catch (error: any) {
      console.error('Failed to update session config', error);
      setIsQualifyingMode(!nextQualifyingMode);
      toast.error('Error Updating Session Config', {
        description: error?.message || 'Failed to update qualifying mode',
      });
    } finally {
      setIsSavingSessionConfig(false);
    }
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === 'kart123') {
      setShowExpirySettings(true);
      setPasswordDialogOpen(false);
      setPasswordInput('');
    } else {
      toast.error('Incorrect Password', {
        description: 'The password you entered is incorrect.',
      });
      setPasswordInput('');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b relative overflow-hidden bg-background">
        <CheckeredFlag />
        <div className="container mx-auto px-4 py-4 relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative z-20">
              <RacelithLogo variant="dark" size="sm" />
            </div>
            {currentView === 'penalty-logging' && activeSessionName && (
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2" title={wsConnected ? 'WebSocket connected' : 'WebSocket disconnected'}>
                  {wsConnected ? (
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {wsConnected ? 'Live' : 'Offline'}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Active Session</p>
                  <p className="font-semibold">{activeSessionName}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="expiry-toggle" className="text-xs text-muted-foreground cursor-pointer">
                      Expiry
                    </Label>
                    <Switch
                      id="expiry-toggle"
                      checked={showExpirySettings}
                      onCheckedChange={handleToggleExpirySettings}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      id="qualifying-mode-toggle"
                      type="button"
                      size="sm"
                      variant={isQualifyingMode ? 'default' : 'outline'}
                      onClick={handleToggleQualifyingMode}
                      disabled={isSavingSessionConfig}
                      className="h-8 text-xs px-3"
                      aria-pressed={isQualifyingMode}
                    >
                      {`Qualifying: ${isQualifyingMode ? 'ON' : 'OFF'}`}
                    </Button>
                  </div>
                  {showExpirySettings && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="expiry-minutes" className="text-xs text-muted-foreground whitespace-nowrap">
                        Minutes:
                      </Label>
                      <Input
                        id="expiry-minutes"
                        type="number"
                        min="1"
                        max="1440"
                        value={warningExpiryMinutes}
                        onChange={(e) => setWarningExpiryMinutes(Number(e.target.value))}
                        className="w-20 h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSaveExpiryMinutes}
                        disabled={isSavingConfig}
                        className="h-8 text-xs"
                      >
                        {isSavingConfig ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <Button variant="outline" onClick={handleBackToSessions}>
                    ← Back to Sessions
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {currentView === 'sessions' ? (
          <SessionManager
            onSessionChange={loadData}
            onSessionSelected={handleSessionSelected}
            onSessionCreatedOrLoaded={handleSessionCreatedOrLoaded}
          />
        ) : (
        <div className="space-y-6">
            {loadError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Unable to Load Data</AlertTitle>
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            )}

            {hasActiveSession === false && !isLoading && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Active Session</AlertTitle>
                <AlertDescription>
                  Please create a new session or load an existing session to start logging infringements.
                </AlertDescription>
              </Alert>
            )}

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1fr_1.4fr] gap-6">
            <div className="min-h-0">
              <InfringementForm
                sessionName={activeSessionName}
                onSubmit={handleNewInfringement}
                isQualifyingMode={isQualifyingMode}
              />
            </div>
            <div className="min-h-0">
              <PendingPenalties 
                  penalties={pendingPenalties}
                onApplyPenalty={handleApplyPenalty}
                  isProcessing={isApplyingPenalty}
              />
            </div>
          </div>

          <InfringementLog 
            infringements={infringements}
            sessionName={activeSessionName}
            searchKartNumber={searchKart}
            onSearchChange={(value) => { setSearchKart(value); setPaginationPage(1); }}
            onEdit={handleEditInfringement}
            onDelete={handleDeleteInfringement}
            warningExpiryMinutes={warningExpiryMinutes}
            serverTimeOffsetMs={serverTimeOffsetMs}
            onPopupOpened={(window) => {
              popupWindowRef.current = window;
            }}
            pagination={{
              page: paginationPage,
              limit: paginationLimit,
              total: paginationTotal,
              totalPages: paginationTotalPages,
              onPageChange: handlePageChange,
              onPageSizeChange: handlePageSizeChange,
            }}
          />

            {isLoading && (
              <p className="text-sm text-muted-foreground">Loading data from server…</p>
            )}
        </div>
        )}

        <EditInfringementDialog
          infringement={editingInfringement}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSave={handleSaveEdit}
          isSaving={isSavingEdit}
        />

        {/* Password Dialog for Expiry Settings */}
        <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enter Password</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="password-input">Password</Label>
                <Input
                  id="password-input"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter password"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && passwordInput) {
                      handlePasswordSubmit();
                    }
                  }}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setPasswordDialogOpen(false);
                  setPasswordInput('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handlePasswordSubmit} disabled={!passwordInput}>
                Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
