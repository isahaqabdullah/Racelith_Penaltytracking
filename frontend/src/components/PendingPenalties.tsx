import { AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
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
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <CardTitle>Pending Penalties</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">Penalties requiring action</p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kart #</TableHead>
                <TableHead>Infringement</TableHead>
                <TableHead>Penalty</TableHead>
                <TableHead>Observer</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {penalties.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No pending penalties
                  </TableCell>
                </TableRow>
              ) : (
                penalties.map((penalty) => (
                  <TableRow key={penalty.id} className="bg-red-50 dark:bg-red-900/10">
                    <TableCell>{penalty.kart_number}</TableCell>
                    <TableCell>{penalty.description}</TableCell>
                    <TableCell>
                      <span className="px-2 py-1 rounded-md bg-red-600 text-white">
                        {penalty.penalty_description ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>{penalty.observer ?? '—'}</TableCell>
                    <TableCell>{formatTime(penalty.timestamp)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isProcessing}
                          onClick={() => onApplyPenalty(penalty.id)}
                        >
                          {isProcessing ? 'Applying...' : 'Apply Penalty'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
