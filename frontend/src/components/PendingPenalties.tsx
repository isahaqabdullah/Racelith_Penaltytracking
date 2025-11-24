import { AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import type { PendingPenalty } from '../api';

interface PendingPenaltiesProps {
  penalties: PendingPenalty[];
  onApplyPenalty: (id: number) => Promise<void> | void;
  isProcessing?: boolean;
}

export function PendingPenalties({
  penalties,
  onApplyPenalty,
  isProcessing = false,
}: PendingPenaltiesProps) {
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <Card className="flex flex-col overflow-hidden" style={{ height: '470px' }}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <CardTitle>Pending Penalties</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">Penalties requiring action</p>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">
        <div
          className="h-full min-h-0 overflow-y-auto overflow-x-auto px-6 pb-6"
          style={{ maxHeight: '380px' }}
        >
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-30 bg-card border-r pr-4">Time</TableHead>
                <TableHead className="sticky left-[90px] z-20 bg-card border-r pr-4">
                  Kart #
                </TableHead>
                <TableHead className="text-center pr-4">Action</TableHead>
                <TableHead>Infringement</TableHead>
                <TableHead>Penalty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {penalties.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No pending penalties
                  </TableCell>
                </TableRow>
              ) : (
                [...penalties].sort((a, b) => {
                  // Sort by most recent first (newest timestamp first)
                  return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                }).map((penalty) => {
                const isWarningOnly = penalty.penalty_description === 'Warning';
                return (
                    <TableRow
                      key={penalty.id}
                      className={isWarningOnly ? undefined : 'bg-red-50 dark:bg-red-900/10'}
                    >
                      <TableCell
                        className={`sticky left-0 z-30 border-r pr-4 ${
                          isWarningOnly ? 'bg-card' : 'bg-red-50 dark:bg-red-900/10'
                        }`}
                      >
                        {formatTime(penalty.timestamp)}
                      </TableCell>
                      <TableCell
                        className={`sticky left-[90px] z-20 border-r pr-4 ${
                          isWarningOnly ? 'bg-card' : 'bg-red-50 dark:bg-red-900/10'
                        }`}
                      >
                        {penalty.kart_number}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant={isWarningOnly ? 'outline' : 'destructive'}
                            disabled={isProcessing || isWarningOnly}
                            onClick={() => onApplyPenalty(penalty.id)}
                          >
                            {isWarningOnly
                              ? 'Warning Logged'
                              : isProcessing
                              ? 'Applying...'
                              : 'Apply Penalty'}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{penalty.description}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-md ${
                            isWarningOnly
                              ? 'bg-yellow-500 text-black'
                              : 'bg-red-600 text-white'
                          }`}
                        >
                          {penalty.penalty_description ?? '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
