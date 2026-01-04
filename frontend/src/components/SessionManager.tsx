import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ScrollArea } from './ui/scroll-area';
import { Calendar, Plus, Play, Trash2, Loader2, RefreshCw, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  API_BASE,
  listSessions,
  startSession,
  loadSession,
  deleteSession,
  exportSession,
  importSession,
  type SessionSummary,
} from '../api';
import { wsManager } from '../websocket';

interface SessionManagerProps {
  onSessionChange?: () => void;
  onSessionSelected?: (sessionName: string) => void;
  onSessionCreatedOrLoaded?: (sessionName: string) => void;
}

export function SessionManager({ onSessionChange, onSessionSelected, onSessionCreatedOrLoaded }: SessionManagerProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportingSession, setExportingSession] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await listSessions();
      setSessions(response.sessions);
    } catch (error) {
      console.error('Failed to load sessions', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, []);

  // Listen to WebSocket events for session changes
  useEffect(() => {
    const unsubscribe = wsManager.subscribe((message) => {
      const sessionEventTypes = new Set([
        'session_started',
        'session_loaded',
        'session_closed',
        'session_deleted',
        'session_imported',
      ]);
      if (message?.type && sessionEventTypes.has(message.type)) {
        // Use loadSessions from closure - don't include in dependencies to prevent reconnections
        void loadSessions();
      }
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - connection should persist regardless of loadSessions changes

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) {
      setCreateError('Session name cannot be empty');
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);
      const sessionName = newSessionName.trim();
      await startSession(sessionName);
      setCreateDialogOpen(false);
      setNewSessionName('');
      setCreateError(null);
      await loadSessions();
      if (onSessionChange) {
        onSessionChange();
      }
      if (onSessionCreatedOrLoaded) {
        onSessionCreatedOrLoaded(sessionName);
      }
      toast.success('Session created successfully', {
        description: `Session "${sessionName}" has been created and activated.`,
      });
    } catch (error: any) {
      console.error('Failed to create session', error);
      // Error message is already extracted by API function
      const errorMessage = error?.message || 'Failed to create session';
      setCreateError(errorMessage);
      toast.error('Failed to Create Session', {
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleLoadSession = async (name: string) => {
    try {
      setIsLoadingSession(true);
      await loadSession(name);
      await loadSessions();
      if (onSessionChange) {
        onSessionChange();
      }
      if (onSessionCreatedOrLoaded) {
        onSessionCreatedOrLoaded(name);
      }
      toast.success('Session loaded successfully', {
        description: `Session "${name}" has been activated.`,
      });
    } catch (error: any) {
      console.error('Failed to load session', error);
      const errorMessage = error?.message || 'Failed to load session';
      toast.error('Failed to Load Session', {
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleSessionRowClick = async (session: SessionSummary) => {
    // If session is not active, load it first
    if (session.status !== 'active') {
      await handleLoadSession(session.name);
    } else {
      // If already active, just navigate
      if (onSessionSelected) {
        onSessionSelected(session.name);
      }
    }
  };

  const handleDeleteClick = (name: string) => {
    setSessionToDelete(name);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) {
      return;
    }

    try {
      setIsDeleting(true);
      await deleteSession(sessionToDelete);
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
      await loadSessions();
      if (onSessionChange) {
        onSessionChange();
      }
    } catch (error: any) {
      console.error('Failed to delete session', error);
      const errorMessage = error?.message || 'Failed to delete session';
      toast.error('Failed to Delete Session', {
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async (sessionName: string, format: 'json' | 'csv' | 'excel') => {
    console.log('🚀 handleExport called:', { sessionName, format });
    try {
      setExportingSession(sessionName);
      console.log(`📤 Starting export: "${sessionName}" as ${format}...`);
      await exportSession(sessionName, format);
      console.log(`✅ Successfully exported session "${sessionName}" as ${format}`);
    } catch (error: any) {
      console.error('❌ Failed to export session', error);
      const errorMessage = error?.message || 'Unknown error';
      toast.error(`Failed to Export Session as ${format.toUpperCase()}`, {
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setExportingSession(null);
      console.log('🏁 Export process finished');
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      return;
    }

    try {
      setIsImporting(true);
      const result = await importSession(importFile);
      setImportDialogOpen(false);
      setImportFile(null);
      await loadSessions();
      if (onSessionChange) {
        onSessionChange();
      }
      if (onSessionCreatedOrLoaded && result.session_name) {
        onSessionCreatedOrLoaded(result.session_name);
      }
      alert(
        `Session imported successfully!\n\n` +
        `Infringements: ${result.imported.infringements}\n` +
        `History records: ${result.imported.history}`
      );
    } catch (error: any) {
      console.error('Failed to import session', error);
      const errorMessage = error?.message || 'Failed to import session';
      toast.error('Failed to Import Session', {
        description: errorMessage,
        duration: 6000,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
        alert('Please select an Excel file (.xlsx or .xls) or CSV file (.csv)');
        return;
      }
      setImportFile(file);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return dateString;
    }
  };

  const activeSession = sessions.find((s) => s.status === 'active');

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <CardTitle>Session Management</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  console.log('🔄 Refresh button clicked');
                  void loadSessions();
                }}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setImportDialogOpen(true);
                }}
                disabled={isLoading || isImporting}
              >
                <Upload className="h-4 w-4 mr-2" />
                Import 
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  console.log('➕ New Session button clicked');
                  setCreateDialogOpen(true);
                }}
                disabled={isLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Session
              </Button>
            </div>
          </div>
          {activeSession && (
            <p className="text-sm text-muted-foreground">
              Active Session: <span className="font-semibold">{activeSession.name}</span>
            </p>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No sessions found. Create a new session to get started.
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow 
                      key={session.name}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSessionRowClick(session)}
                    >
                      <TableCell className="font-medium">{session.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={session.status === 'active' ? 'default' : 'outline'}
                        >
                          {session.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(session.started_at)}
                      </TableCell>
                      <TableCell 
                        onClick={(e: React.MouseEvent<HTMLTableCellElement>) => {
                          console.log('📋 TableCell clicked');
                          e.stopPropagation();
                        }}
                        onMouseDown={(e: React.MouseEvent<HTMLTableCellElement>) => {
                          console.log('📋 TableCell mouseDown');
                          e.stopPropagation();
                        }}
                      >
                        <div className="flex justify-end gap-2">
                          {session.status !== 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                console.log('▶️ Load button clicked for:', session.name);
                                e.stopPropagation();
                                void handleLoadSession(session.name);
                              }}
                              disabled={isLoadingSession}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Load
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={exportingSession === session.name}
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation();
                              console.log('📥 Export button clicked for:', session.name);
                              void handleExport(session.name, 'excel');
                            }}
                          >
                            {exportingSession === session.name ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                Exporting...
                              </>
                            ) : (
                              <>
                                <Download className="h-4 w-4 mr-1" />
                                Export 
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteClick(session.name)}
                            disabled={isDeleting}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Create Session Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open);
        if (!open) {
          setCreateError(null);
          setNewSessionName('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="session-name">Session Name</Label>
              <Input
                id="session-name"
                value={newSessionName}
                onChange={(e) => {
                  setNewSessionName(e.target.value);
                  setCreateError(null); // Clear error when user types
                }}
                placeholder="e.g., Race Day 2024-01-15"
                className={createError ? 'border-destructive' : ''}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSessionName.trim()) {
                    void handleCreateSession();
                  }
                }}
              />
              {createError && (
                <p className="text-sm text-destructive mt-1">{createError}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Session name must be 1-59 characters, can contain letters, numbers, spaces, underscores, and hyphens.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                setNewSessionName('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateSession} disabled={isCreating || !newSessionName.trim()}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Session'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the session &quot;{sessionToDelete}&quot;? This action
              cannot be undone and will permanently delete all infringement data for this session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Session Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Session from Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="import-file">Select Excel File</Label>
              <Input
                id="import-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                disabled={isImporting}
              />
              {importFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {importFile.name} ({(importFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                The file should be in the format exported by this application (Excel .xlsx or CSV .csv).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImportDialogOpen(false);
                setImportFile(null);
              }}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={isImporting || !importFile}>
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                'Import Session'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

