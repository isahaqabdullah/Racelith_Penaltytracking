import { useState, useEffect, useCallback } from 'react';
import { InfringementForm } from './components/InfringementForm';
import { InfringementLog } from './components/InfringementLog';
import { PendingPenalties } from './components/PendingPenalties';
import { EditInfringementDialog } from './components/EditInfringementDialog';
import { SessionManager } from './components/SessionManager';
import { CheckeredFlag } from './components/CheckeredFlag';
import { KronosLogo } from './components/KronosLogo';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';
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
} from './api';
import type {
  CreateInfringementPayload,
  InfringementRecord,
  PendingPenalty,
  UpdateInfringementPayload,
} from './api';

const DEFAULT_PERFORMED_BY = 'Race Control Operator';

export default function App() {
  const [infringements, setInfringements] = useState<InfringementRecord[]>([]);
  const [pendingPenalties, setPendingPenalties] = useState<PendingPenalty[]>([]);
  const [editingInfringement, setEditingInfringement] = useState<InfringementRecord | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplyingPenalty, setIsApplyingPenalty] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const checkActiveSession = useCallback(async () => {
    try {
      const response = await listSessions();
      const active = response.sessions.some((s) => s.status === 'active');
      setHasActiveSession(active);
      return active;
    } catch (error) {
      console.error('Failed to check active session', error);
      return false;
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
        const hasActive = await checkActiveSession();
        
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

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
    } catch (error: any) {
      console.error('Failed to delete infringement', error);
      toast.error('Error Deleting Infringement', {
        description: error?.message || 'Failed to delete infringement',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b relative overflow-hidden">
        <CheckeredFlag />
        <div className="container mx-auto px-4 py-6 relative z-10">
          <div className="flex items-center gap-4">
            <KronosLogo />
            <div>
              <h1 className="text-[36px] font-bold not-italic">Kronos</h1>
              <p className="text-muted-foreground">Karting Infringement Management System</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <SessionManager onSessionChange={loadData} />

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
                Please create a new session or load an existing session from the Session Management panel above to start logging infringements.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <InfringementForm onSubmit={handleNewInfringement} />
            </div>
            <div>
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
          />

          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading data from server…</p>
          )}
        </div>

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
