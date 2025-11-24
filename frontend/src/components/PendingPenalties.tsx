import { AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
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
          className="h-full min-h-0 overflow-y-auto overflow-x-auto"
          style={{ maxHeight: '380px' }}
        >
          <div className="px-6 pb-6">
            <table className="w-full caption-bottom text-sm min-w-[600px] border-collapse">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap sticky left-0 z-30 bg-card border-r pr-4">
                    Time
                  </th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap sticky left-[90px] z-20 bg-card border-r pr-4">
                    Kart #
                  </th>
                  <th className="h-10 px-2 text-center align-middle font-medium whitespace-nowrap pr-4">Action</th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Infringement</th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Penalty</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {penalties.length === 0 ? (
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td colSpan={5} className="p-2 align-middle text-center text-muted-foreground">
                      No pending penalties
                    </td>
                  </tr>
                ) : (
                  [...penalties].sort((a, b) => {
                    // Sort by most recent first (newest timestamp first)
                    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                  }).map((penalty) => {
                    const isWarningOnly = penalty.penalty_description === 'Warning';
                    const rowBgClass = isWarningOnly ? 'bg-card' : 'bg-red-50 dark:bg-red-900/10';
                    return (
                      <tr
                        key={penalty.id}
                        className={`border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted ${isWarningOnly ? '' : 'bg-red-50 dark:bg-red-900/10'}`}
                      >
                        <td
                          className={`p-2 align-middle whitespace-nowrap sticky left-0 z-30 border-r pr-4 ${rowBgClass}`}
                        >
                          {formatTime(penalty.timestamp)}
                        </td>
                        <td
                          className={`p-2 align-middle whitespace-nowrap sticky left-[90px] z-20 border-r pr-4 ${rowBgClass}`}
                        >
                          {penalty.kart_number}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap pr-4">
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
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap">{penalty.description}</td>
                        <td className="p-2 align-middle whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded-md ${
                              isWarningOnly
                                ? 'bg-yellow-500 text-black'
                                : 'bg-red-600 text-white'
                            }`}
                          >
                            {penalty.penalty_description ?? '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
