import { useState, useRef, type CSSProperties } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Pencil, Trash2, Maximize2 } from 'lucide-react';
import type { InfringementRecord } from '../api';
import { API_BASE } from '../api';
import { generatePopupHTML } from './popup/popupTemplate';
import { ScrollArea } from './ui/scroll-area';

interface InfringementLogProps {
  infringements: InfringementRecord[];
  onEdit: (infringement: InfringementRecord) => void;
  onDelete: (id: number) => void;
  warningExpiryMinutes?: number;
  onPopupOpened?: (window: Window) => void;
}

export function InfringementLog({ infringements, onEdit, onDelete, warningExpiryMinutes = 180, onPopupOpened }: InfringementLogProps) {
  const [searchKartNumber, setSearchKartNumber] = useState('');
  const popupWindowRef = useRef<Window | null>(null);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // Filter infringements by kart number (exact match)
  const filteredInfringements = searchKartNumber
    ? infringements.filter((inf) => {
        const searchValue = searchKartNumber.trim();
        const kartNum = inf.kart_number.toString();
        return kartNum === searchValue || Number(kartNum) === Number(searchValue);
      })
    : infringements;

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
    <Card>
      <CardHeader>
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
      <CardContent className="p-0">
        <ScrollArea className="h-[750px] w-full overflow-x-auto">
          <div className="min-w-[1200px] px-6 pb-6">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Kart #</TableHead>
                <TableHead>Turn</TableHead>
                <TableHead>Infringement</TableHead>
                <TableHead>Penalty</TableHead>
                <TableHead>Observer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInfringements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {searchKartNumber ? `No infringements found for kart #${searchKartNumber}` : 'No infringements logged yet'}
                  </TableCell>
                </TableRow>
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
                    <TableRow key={inf.id}>
                      <TableCell>{formatTime(inf.timestamp)}</TableCell>
                      <TableCell>{inf.kart_number}</TableCell>
                      <TableCell>{inf.turn_number ?? '—'}</TableCell>
                      <TableCell>{inf.description}</TableCell>
                      <TableCell>{inf.penalty_description ?? '—'}</TableCell>
                      <TableCell>{inf.observer ?? '—'}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={statusVariant}
                          style={customStyle}
                        >
                          {statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
