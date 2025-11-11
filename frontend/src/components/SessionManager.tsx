import { useState, useEffect } from 'react';
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
import { Calendar, Plus, Play, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { API_BASE, listSessions, startSession, loadSession, deleteSession, type SessionSummary } from '../api';

interface SessionManagerProps {
  onSessionChange?: () => void;
}

export function SessionManager({ onSessionChange }: SessionManagerProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadSessions = async () => {
    try {
      setIsLoading(true);
      const response = await listSessions();
      setSessions(response.sessions);
    } catch (error) {
      console.error('Failed to load sessions', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  // Listen to WebSocket events for session changes
  useEffect(() => {
    const url = `${API_BASE.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(url);
    } catch (error) {
      console.error('Failed to establish WebSocket connection for sessions', error);
      return;
    }

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const sessionEventTypes = new Set([
          'session_started',
          'session_loaded',
          'session_closed',
          'session_deleted',
        ]);
        if (message?.type && sessionEventTypes.has(message.type)) {
          void loadSessions();
        }
      } catch (error) {
        console.error('Malformed WebSocket message in SessionManager', error);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error in SessionManager', error);
    };

    return () => {
      socket?.close();
    };
  }, []);

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) {
      return;
    }

    try {
      setIsCreating(true);
      await startSession(newSessionName.trim());
      setCreateDialogOpen(false);
      setNewSessionName('');
      await loadSessions();
      if (onSessionChange) {
        onSessionChange();
      }
    } catch (error) {
      console.error('Failed to create session', error);
      alert('Failed to create session. It may already exist.');
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
    } catch (error) {
      console.error('Failed to load session', error);
      alert('Failed to load session.');
    } finally {
      setIsLoadingSession(false);
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
    } catch (error) {
      console.error('Failed to delete session', error);
      alert('Failed to delete session.');
    } finally {
      setIsDeleting(false);
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
                onClick={() => void loadSessions()}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setCreateDialogOpen(true)}
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
                    <TableRow key={session.name}>
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
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {session.status !== 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleLoadSession(session.name)}
                              disabled={isLoadingSession}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Load
                            </Button>
                          )}
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
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
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
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="e.g., Race Day 2024-01-15"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSessionName.trim()) {
                    void handleCreateSession();
                  }
                }}
              />
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
    </>
  );
}

