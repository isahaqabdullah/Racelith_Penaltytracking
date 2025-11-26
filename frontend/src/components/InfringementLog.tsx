import { useState, useRef, type CSSProperties } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Pencil, Trash2, Maximize2 } from 'lucide-react';
import type { InfringementRecord } from '../api';
import { API_BASE } from '../api';
import { generatePopupHTML } from './popup/popupTemplate';

interface InfringementLogProps {
  infringements: InfringementRecord[];
  onEdit: (infringement: InfringementRecord) => void;
  onDelete: (id: number) => void;
  warningExpiryMinutes?: number;
  onPopupOpened?: (window: Window) => void;
}

export function InfringementLog({ infringements, onEdit, onDelete, warningExpiryMinutes = 180, onPopupOpened }: InfringementLogProps) {
  const [searchKartNumber, setSearchKartNumber] = useState('');
  const [showPenaltiesOnly, setShowPenaltiesOnly] = useState(false);
  const popupWindowRef = useRef<Window | null>(null);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const isPenaltyEntry = (inf: InfringementRecord) => {
    const description = (inf.penalty_description || '').toLowerCase();
    const hasMeaningfulPenalty =
      inf.penalty_description &&
      description !== 'warning' &&
      description !== 'no further action';
    const pendingPenalty = inf.penalty_due === 'Yes' && hasMeaningfulPenalty;
    const appliedPenalty = inf.penalty_due === 'No' && Boolean(inf.penalty_taken) && hasMeaningfulPenalty;
    return pendingPenalty || appliedPenalty;
  };

  // Filter infringements by kart number (exact match) and optional penalties-only filter
  const filteredInfringements = (searchKartNumber
    ? infringements.filter((inf) => {
        const searchValue = searchKartNumber.trim();
        const kartNum = inf.kart_number.toString();
        return kartNum === searchValue || Number(kartNum) === Number(searchValue);
      })
    : infringements
  ).filter((inf) => (showPenaltiesOnly ? isPenaltyEntry(inf) : true));

  const handleExpand = () => {
    const newWindow = window.open('', '_blank', 'width=1400,height=900');
    if (!newWindow) {
      console.error('Failed to open popup window - popup may be blocked');
      return;
    }
    
    try {
      popupWindowRef.current = newWindow;
      if (onPopupOpened) {
        onPopupOpened(newWindow);
      }

      // Get API base URL - use window location to determine if we're in Docker or local
      let apiBase = API_BASE || 'http://localhost:8000';
      
      // If API_BASE is relative or undefined, try to construct from current window location
      if (!apiBase || apiBase.startsWith('/')) {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        // In Docker, backend is typically on port 8000, frontend on 3000
        // Try to use the same hostname but different port
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          apiBase = 'http://localhost:8000';
        } else {
          // In production/Docker, try to use the same hostname
          apiBase = `${protocol}//${hostname}:8000`;
        }
      }
      
      console.log('Opening popup with API_BASE:', apiBase);
      const expiryMins = warningExpiryMinutes || 180;
      
      // Generate HTML using the refactored template
      const htmlContent = generatePopupHTML(apiBase, expiryMins);

      // Write content to the window
      try {
        if (newWindow && !newWindow.closed) {
          newWindow.document.open();
          newWindow.document.write(htmlContent);
          newWindow.document.close();
          
          // Focus the window
          newWindow.focus();
        }
      } catch (writeError) {
        console.error('Error writing to popup window:', writeError);
        // Fallback: try using data URL
        try {
          const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
          newWindow.location.href = dataUrl;
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
          newWindow?.close();
          alert('Failed to open popup window. Please check if popups are blocked.');
        }
      }
    } catch (error) {
      console.error('Error creating popup window:', error);
      newWindow?.close();
    }
  };

  const isExpired = (inf: InfringementRecord) => {
    if (inf.penalty_description !== 'Warning') return false;
    const timestamp = new Date(inf.timestamp);
    const now = new Date();
    const diffMinutes = (now.getTime() - timestamp.getTime()) / (1000 * 60);
    return diffMinutes > warningExpiryMinutes;
  };

  return (
    <Card className="flex flex-col overflow-hidden" style={{ height: '750px', maxHeight: '750px' }}>
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Recent Infringements</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleExpand}
              className="h-8 w-8 p-0"
              aria-label="Open in new tab"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {searchKartNumber && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setSearchKartNumber('')}
                className="h-7 px-3 text-xs"
              >
                Back
              </Button>
            )}
            <Button
              type="button"
              variant={showPenaltiesOnly ? 'secondary' : 'outline'}
              onClick={() => setShowPenaltiesOnly((prev) => !prev)}
              className="h-7 px-3 text-xs"
            >
              {showPenaltiesOnly ? 'Showing Penalties' : 'All Entries'}
            </Button>
            <div className="w-40">
              <Label htmlFor="kart-search" className="sr-only">Search by Kart Number</Label>
              <Input
                id="kart-search"
                type="text"
                placeholder="Search by kart #"
                value={searchKartNumber}
                onChange={(e) => setSearchKartNumber(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
        <div
          className="h-full w-full overflow-y-auto overflow-x-auto"
          style={{ height: '100%' }}
        >
          <div className="px-6 pb-6">
            <table className="w-full caption-bottom text-sm min-w-[1200px] border-collapse">
              <thead className="[&_tr]:border-b sticky top-0 z-40 bg-card">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap sticky left-0 z-50 bg-card border-r pr-4">
                    Time
                  </th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap sticky left-[90px] z-40 bg-card border-r pr-4">
                    Kart #
                  </th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Turn</th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Infringement</th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Penalty</th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Observer</th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Status</th>
                  <th className="h-10 px-2 text-right align-middle font-medium whitespace-nowrap sticky right-0 z-40 bg-card border-l pl-4">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {filteredInfringements.length === 0 ? (
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td colSpan={8} className="p-2 align-middle text-center text-muted-foreground">
                      {searchKartNumber ? `No infringements found for kart #${searchKartNumber}` : 'No infringements logged yet'}
                    </td>
                  </tr>
                ) : (
                  filteredInfringements.map((inf) => {
                    const isWarning = inf.penalty_description === 'Warning';
                    
                    // Check if warning is expired based on configurable expiry time
                    const isExpiredWarning = isWarning && (() => {
                      const timestamp = new Date(inf.timestamp);
                      const now = new Date();
                      const diffMinutes = (now.getTime() - timestamp.getTime()) / (1000 * 60);
                      return diffMinutes > warningExpiryMinutes;
                    })();
                    
                    const penaltyApplied =
                      inf.penalty_due === 'No' &&
                      Boolean(inf.penalty_taken) &&
                      !isWarning;
                    const turnDisplay =
                      inf.turn_number === null || inf.turn_number === undefined || inf.turn_number === ''
                        ? '—'
                        : String(inf.turn_number);

                    const isNoFurtherAction = inf.penalty_description === 'No further action';

                    let statusLabel = '';
                    let statusVariant: 'default' | 'destructive' | 'outline' | 'secondary' = 'outline';
                    let customStyle: CSSProperties | undefined = undefined;

                    if (penaltyApplied) {
                      statusLabel = 'Applied';
                      statusVariant = 'destructive';
                      customStyle = { backgroundColor: '#008000', color: '#ffffff', borderColor: 'transparent' };
                    } else if (isExpiredWarning) {
                      statusLabel = 'Expired';
                      statusVariant = 'secondary';
                    } else if (isWarning) {
                      statusLabel = 'Warning';
                      statusVariant = 'destructive';
                      customStyle = { backgroundColor: '#E9D502', color: '#ffffff', borderColor: 'transparent' };
                    } else if (isNoFurtherAction && inf.penalty_due === 'No') {
                      statusLabel = 'No action';
                      statusVariant = 'outline';
                    } else if (inf.penalty_due === 'Yes') {
                      statusLabel = 'Pending';
                      statusVariant = 'destructive';
                      customStyle = { backgroundColor: '#dc2626', color: '#ffffff', borderColor: 'transparent' };
                    } else {
                      statusLabel = 'Cleared';
                      statusVariant = 'outline';
                    }
                    return (
                      <tr key={inf.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        <td className="p-2 align-middle whitespace-nowrap sticky left-0 z-30 bg-card border-r pr-4">
                          {formatTime(inf.timestamp)}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap sticky left-[90px] z-20 bg-card border-r pr-4">
                          {inf.kart_number}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap">{turnDisplay}</td>
                        <td className="p-2 align-middle whitespace-nowrap">{inf.description}</td>
                        <td className="p-2 align-middle whitespace-nowrap">{inf.penalty_description ?? '—'}</td>
                        <td className="p-2 align-middle whitespace-nowrap">{inf.observer ?? '—'}</td>
                        <td className="p-2 align-middle whitespace-nowrap">
                          <Badge 
                            variant={statusVariant}
                            style={customStyle}
                          >
                            {statusLabel}
                          </Badge>
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap sticky right-0 z-20 bg-card border-l pl-4">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onEdit(inf)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onDelete(inf.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
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
