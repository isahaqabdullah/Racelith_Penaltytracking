import { useState, useRef, type CSSProperties } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Pencil, Trash2, Maximize2, ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import type { InfringementRecord } from '../api';
import { API_BASE } from '../api';
import { generatePopupHTML } from './popup/popupTemplate';

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (limit: number) => void;
}

interface InfringementLogProps {
  infringements: InfringementRecord[];
  onEdit: (infringement: InfringementRecord) => void;
  onDelete: (id: number) => void;
  warningExpiryMinutes?: number;
  onPopupOpened?: (window: Window) => void;
  pagination?: PaginationProps;
}

type FilterType = 'all' | 'warning-flag' | 'penalties';

export function InfringementLog({ infringements, onEdit, onDelete, warningExpiryMinutes = 180, onPopupOpened, pagination }: InfringementLogProps) {
  const [searchKartNumber, setSearchKartNumber] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
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

  // Check if a warning is expired
  const isWarningExpired = (inf: InfringementRecord) => {
    if (inf.penalty_description !== 'Warning') return false;
    const timestamp = new Date(inf.timestamp);
    const now = new Date();
    const diffMinutes = (now.getTime() - timestamp.getTime()) / (1000 * 60);
    return diffMinutes > warningExpiryMinutes;
  };

  // Check if this is a 2nd warning for white line or yellow zone (for flag display)
  // This calculates the actual current warning count by counting only non-expired warnings
  const isSecondWarning = (inf: InfringementRecord) => {
    const isWarning = inf.penalty_description === 'Warning';
    if (!isWarning) return false;
    
    const description = (inf.description || '').toLowerCase();
    const isWhiteLine = description.includes('white line infringement');
    const isYellowZone = description.includes('yellow zone');
    
    if (!isWhiteLine && !isYellowZone) return false;
    
    // Check if this warning itself is expired
    if (isWarningExpired(inf)) return false;
    
    // Calculate the actual current warning count by counting all valid (non-expired) warnings
    // for the same kart and same infringement type, up to and including this one
    const now = new Date();
    const expiryThreshold = new Date(now.getTime() - warningExpiryMinutes * 60 * 1000);
    
    // Find the last penalty for this kart and infringement type (if any)
    const lastPenalty = infringements
      .filter(i => 
        i.kart_number === inf.kart_number &&
        i.description?.toLowerCase().includes(isWhiteLine ? 'white line infringement' : 'yellow zone') &&
        i.penalty_due === 'Yes'
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    // Determine the cycle start (either expiry threshold or last penalty timestamp, whichever is later)
    const cycleStart = lastPenalty 
      ? new Date(Math.max(expiryThreshold.getTime(), new Date(lastPenalty.timestamp).getTime()))
      : expiryThreshold;
    
    // Count all valid warnings for this kart and infringement type
    // Valid means: not expired, hasn't triggered a penalty, and is within the cycle
    const validWarnings = infringements.filter(i => {
      if (i.kart_number !== inf.kart_number) return false;
      const iDesc = (i.description || '').toLowerCase();
      const matchesType = isWhiteLine 
        ? iDesc.includes('white line infringement')
        : iDesc.includes('yellow zone');
      if (!matchesType) return false;
      
      // Must be a warning
      if (i.penalty_description !== 'Warning') return false;
      
      // Must not have triggered a penalty
      if (i.penalty_due === 'Yes') return false;
      
      // Must be within the cycle (after cycle start)
      const iTimestamp = new Date(i.timestamp);
      if (iTimestamp < cycleStart) return false;
      
      // Must not be expired
      if (isWarningExpired(i)) return false;
      
      // Must be before or equal to the current infringement's timestamp
      return new Date(i.timestamp).getTime() <= new Date(inf.timestamp).getTime();
    });
    
    // Sort by timestamp to get the order
    validWarnings.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    // Find the position of the current infringement in the valid warnings list
    const currentIndex = validWarnings.findIndex(w => w.id === inf.id);
    
    // It's the 2nd warning if it's at index 1 (0-indexed, so 2nd item)
    return currentIndex === 1;
  };

  // Filter infringements by kart number (exact match) and filter type
  const filteredInfringements = (searchKartNumber
    ? infringements.filter((inf) => {
        const searchValue = searchKartNumber.trim();
        const kartNum = inf.kart_number.toString();
        return kartNum === searchValue || Number(kartNum) === Number(searchValue);
      })
    : infringements
  ).filter((inf) => {
    if (filterType === 'penalties') {
      return isPenaltyEntry(inf);
    } else if (filterType === 'warning-flag') {
      return isSecondWarning(inf);
    }
    return true; // 'all'
  });

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
            <Select
              value={filterType}
              onValueChange={(value: FilterType) => setFilterType(value)}
            >
              <SelectTrigger className="h-7 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entries</SelectItem>
                <SelectItem value="warning-flag">Warning Flag</SelectItem>
                <SelectItem value="penalties">Penalties</SelectItem>
              </SelectContent>
            </Select>
            {pagination && (
              <>
                <div className="flex items-center gap-2">
                  <Label htmlFor="page-size" className="text-xs text-muted-foreground whitespace-nowrap">
                    Entries:
                  </Label>
                  <Select
                    value={pagination.limit.toString()}
                    onValueChange={(value: string) => pagination.onPageSizeChange(Number(value))}
                  >
                    <SelectTrigger id="page-size" className="h-7 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                      <SelectItem value="300">300</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                      <SelectItem value="1000">1000</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Page</span>
                  <span className="font-medium text-foreground">{pagination.page}</span>
                  <span>of</span>
                  <span className="font-medium text-foreground">{pagination.totalPages}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pagination.onPageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="h-7 px-2"
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pagination.onPageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="h-7 px-2"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </>
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
                    
                    // Check if this is a 2nd warning (out of 3) for white line or yellow zone
                    // Note: warning_count is stored at creation time. Even if earlier warnings expire,
                    // this infringement was still created as the 2nd warning, so we show the flag.
                    const showWarningFlag = isSecondWarning(inf);
                    
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
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={statusVariant}
                              style={customStyle}
                            >
                              {statusLabel}
                            </Badge>
                            {showWarningFlag && (
                              <svg 
                                className="h-5 w-5" 
                                viewBox="0 0 24 24" 
                                fill="none"
                                style={{ backgroundColor: '#e5e7eb' }}
                                title="Second warning - next warning will result in penalty"
                              >
                                {/* Grey background */}
                                <rect x="0" y="0" width="24" height="24" fill="#e5e7eb"/>
                                {/* Flag pole */}
                                <rect x="2" y="2" width="2" height="18" fill="black"/>
                                {/* Flag - white half (bottom-right triangle) */}
                                <polygon 
                                  points="4,2 4,14 16,14" 
                                  fill="white"
                                />
                                {/* Flag - black half (top-left triangle) */}
                                <polygon 
                                  points="4,2 18,2 16,14" 
                                  fill="black"
                                />
                              </svg>
                            )}
                          </div>
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
        {pagination && (
          <div className="px-6 py-2 border-t bg-card">
            <div className="text-xs text-muted-foreground">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
