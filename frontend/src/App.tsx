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
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  API_BASE,
  applyIndividualPenalty,
  createInfringement,
  deleteInfringement,
  fetchInfringements,
  fetchPendingPenalties,
  updateInfringement as updateInfringementApi,
  listSessions,
  getConfig,
  updateConfig,
} from './api';
import type {
  CreateInfringementPayload,
  InfringementRecord,
  PendingPenalty,
  UpdateInfringementPayload,
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
  const popupWindowRef = useRef<Window | null>(null);

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

  const checkActiveSession = useCallback(async () => {
    try {
      const response = await listSessions();
      const activeSession = response.sessions.find((s) => s.status === 'active');
      const hasActive = !!activeSession;
      setHasActiveSession(hasActive);
      if (activeSession) {
        setActiveSessionName(activeSession.name);
      }
      return { hasActive, sessionName: activeSession?.name || null };
    } catch (error) {
      console.error('Failed to check active session', error);
      return { hasActive: false, sessionName: null };
    }
  }, []);

  const loadData = useCallback(
    async (withSpinner = true) => {
      if (withSpinner) {
        setIsLoading(true);
        setLoadError(null);
      }
      try {
        // First check if there's an active session
        const { hasActive } = await checkActiveSession();
        
        if (!hasActive) {
          setHasActiveSession(false);
          setInfringements([]);
          setPendingPenalties([]);
          if (withSpinner) {
            setLoadError('No active session. Please create or load a session to view infringements.');
          }
          return;
        }

        setHasActiveSession(true);
        const [infringementData, pendingData] = await Promise.all([
          fetchInfringements(),
          fetchPendingPenalties(),
        ]);
        setInfringements(infringementData);
        setPendingPenalties(pendingData);
        setLoadError(null);
      } catch (error: any) {
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
        if (withSpinner) {
          setIsLoading(false);
        }
      }
    },
    [checkActiveSession]
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

  useEffect(() => {
    const url = `${API_BASE.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(url);
    } catch (error) {
      console.error('Failed to establish WebSocket connection', error);
      return;
    }

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
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
        if (message?.type && relevantTypes.has(message.type)) {
          void loadData(false);
        }
      } catch (error) {
        console.error('Malformed WebSocket message', error);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error', error);
    };

    return () => {
      socket?.close();
    };
  }, [loadData]);

  // Listen for messages from popup windows (for edit/delete actions)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
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
        try {
          await deleteInfringement(event.data.id);
          setInfringements((prev) => prev.filter((inf) => inf.id !== event.data.id));
          setPendingPenalties((prev) => prev.filter((penalty) => penalty.id !== event.data.id));
          toast.success('Infringement deleted successfully');
          await loadData(false);
          // Notify popup window (though it will also get WebSocket update)
          if (popupWindowRef.current && !popupWindowRef.current.closed) {
            popupWindowRef.current.postMessage({ type: 'updateInfringements' }, '*');
          }
        } catch (error: any) {
          console.error('Failed to delete infringement', error);
          toast.error('Error Deleting Infringement', {
            description: error?.message || 'Failed to delete infringement',
          });
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [infringements, loadData, deleteInfringement]);

  const handleNewInfringement = async (payload: CreateInfringementPayload) => {
    try {
      const record = await createInfringement({
        ...payload,
        performed_by: payload.performed_by || DEFAULT_PERFORMED_BY,
      });
      setInfringements((prev) => [record, ...prev]);
      const pending = await fetchPendingPenalties();
      setPendingPenalties(pending);
      toast.success('Infringement created successfully');
      // Notify popup window
      if (popupWindowRef.current && !popupWindowRef.current.closed) {
        popupWindowRef.current.postMessage({ type: 'updateInfringements' }, '*');
      }
    } catch (error: any) {
      console.error('Failed to create infringement', error);
      const errorMessage = error?.message || 'Failed to create infringement';
      toast.error('Error Creating Infringement', {
        description: errorMessage.includes('relation') || errorMessage.includes('does not exist')
          ? 'No active session. Please create or load a session first.'
          : errorMessage,
      });
    }
  };

  const handleApplyPenalty = async (id: number) => {
    try {
      setIsApplyingPenalty(true);
      await applyIndividualPenalty(id, DEFAULT_PERFORMED_BY);
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
        performed_by: payload.performed_by || DEFAULT_PERFORMED_BY,
      });
    setInfringements((prev) =>
        prev.map((inf) => (inf.id === updated.id ? updated : inf))
      );
      const pending = await fetchPendingPenalties();
      setPendingPenalties(pending);
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
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteInfringement = async (id: number) => {
    try {
      await deleteInfringement(id);
      setInfringements((prev) => prev.filter((inf) => inf.id !== id));
      setPendingPenalties((prev) => prev.filter((penalty) => penalty.id !== id));
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
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b relative overflow-hidden bg-background">
        <CheckeredFlag />
        <div className="container mx-auto px-4 py-4 relative z-10">
          <div className="flex items-center justify-between gap-4">
            <div className="relative z-20">
              <RacelithLogo variant="dark" size="sm" />
            </div>
            {currentView === 'penalty-logging' && activeSessionName && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Active Session</p>
                  <p className="font-semibold">{activeSessionName}</p>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <Button variant="outline" onClick={handleBackToSessions}>
                    ← Back to Sessions
                  </Button>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="warning-expiry" className="text-xs text-muted-foreground whitespace-nowrap">
                      Warning Expiry (min):
                    </Label>
                    <Input
                      id="warning-expiry"
                      type="number"
                      min="1"
                      value={warningExpiryMinutes}
                      onChange={async (e) => {
                        const value = parseInt(e.target.value, 10);
                        if (!isNaN(value) && value > 0) {
                          setWarningExpiryMinutes(value);
                          try {
                            await updateConfig({ warning_expiry_minutes: value });
                            toast.success('Warning expiry updated successfully');
                          } catch (error: any) {
                            console.error('Failed to update config:', error);
                            toast.error('Error Updating Config', {
                              description: error?.message || 'Failed to update warning expiry',
                            });
                            // Revert to previous value on error
                            const config = await getConfig();
                            setWarningExpiryMinutes(config.warning_expiry_minutes);
                          }
                        }
                      }}
                      className="w-20 h-8 text-sm"
                    />
                  </div>
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
              <InfringementForm onSubmit={handleNewInfringement} />
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
            onEdit={handleEditInfringement}
            onDelete={handleDeleteInfringement}
            warningExpiryMinutes={warningExpiryMinutes}
            onPopupOpened={(window) => {
              popupWindowRef.current = window;
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
      </main>
    </div>
  );
}
