import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Combobox } from './ui/combobox';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { PartialSubmissionError, type CreateInfringementPayload } from '../api';

const INFRINGEMENT_OPTIONS = [
  'White Line Infringement',
  'Yellow Zone Infringement',
  'Track Limits',
  'Advantage by Contact',
  'Contact',
  'Overtaking under yellow flag',
  'Not Slowing under yellow flag',
  'Pit Time Infringement',
  'Dangerous Driving',
  'Excessive Weaving or Blocking',
  'Unsafe Re-entry',
  'Ignoring Flags',
  'Pit Lane Speed',
  'Advantage-Exceeding track limits',
  'Other',
];

const PENALTY_OPTIONS = [
  'Warning',
  '5 Sec',
  '10 Sec',
  'Grid Penalty',
  'No further action',
  'Under investigation',
  'Fastest Lap Invalidation',
  'Lap Invalidation',
  'Stop and Go',
  'Drive Through',
  'Time Penalty',
  'Disqualification',
  'Black Flag',
];

const QUALIFYING_AUTO_PENALTY = 'Fastest Lap Invalidation';
const QUALIFYING_AUTO_TYPES = new Set([
  'White Line Infringement',
  'Yellow Zone Infringement',
  'Track Limits',
]);

const DEFAULT_WARNING_TYPES = new Set([
  'White Line Infringement',
  'Yellow Zone Infringement',
]);

interface InfringementFormProps {
  sessionName: string | null;
  onSubmit: (payloads: CreateInfringementPayload[]) => Promise<void> | void;
  isQualifyingMode: boolean;
}

interface KartToken {
  value: string;
  isValid: boolean;
}

const KART_TOKEN_REGEX = /^\d+$/;

const sanitizeKartInput = (value: string) => value.replace(/^\s+/, '');

const parseKartTokens = (value: string): KartToken[] =>
  sanitizeKartInput(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ({
      value: token,
      isValid: KART_TOKEN_REGEX.test(token),
    }));

const isEditableElement = (element: Element | null): boolean => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  if (tagName === 'input') {
    const input = element as HTMLInputElement;
    return !input.readOnly && !input.disabled;
  }

  return false;
};

const getKartTokenStyle = (token: string) => {
  const kartNumber = Number(token);
  const hue = (kartNumber * 37) % 360;
  return {
    backgroundColor: `hsl(${hue} 82% 92%)`,
    borderColor: `hsl(${hue} 56% 60%)`,
    color: `hsl(${hue} 56% 26%)`,
  };
};

export function InfringementForm({ onSubmit, isQualifyingMode, sessionName }: InfringementFormProps) {
  const draftSession = useRef<string | null>(null);
  const receipts = useRef<Map<string, string>>(new Map());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [kartNumber, setKartNumber] = useState('');
  const [turn, setTurn] = useState('');
  const [observer, setObserver] = useState('');
  const [infringement, setInfringement] = useState('');
  const [penaltyDescription, setPenaltyDescription] = useState('');
  const [secondKartNumber, setSecondKartNumber] = useState('');
  const [lapNumber, setLapNumber] = useState('');
  const [draftTimestamp, setDraftTimestamp] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const kartInputRef = useRef<HTMLInputElement | null>(null);
  const kartTokens = useMemo(() => parseKartTokens(kartNumber), [kartNumber]);
  const hasInvalidKartTokens = useMemo(
    () => kartTokens.some((token) => !token.isValid),
    [kartTokens]
  );

  const ensureDraftTimestamp = useCallback(() => {
    if (!draftSession.current) draftSession.current = sessionName;
    setDraftTimestamp((existing) => existing ?? new Date().toISOString());
  }, [sessionName]);

  const getAutoPenaltyForInfringement = useCallback(
    (infringementType: string): string | null => {
      if (isQualifyingMode && QUALIFYING_AUTO_TYPES.has(infringementType)) {
        return QUALIFYING_AUTO_PENALTY;
      }
      if (!isQualifyingMode && DEFAULT_WARNING_TYPES.has(infringementType)) {
        return 'Warning';
      }
      return null;
    },
    [isQualifyingMode]
  );

  const handleKartNumberChange = (nextValue: string) => {
    const sanitized = sanitizeKartInput(nextValue);
    setKartNumber(sanitized);
    if (sanitized.trim() !== '') {
      ensureDraftTimestamp();
    }
  };

  const handleTurnChange = (nextValue: string) => {
    setTurn(nextValue);
    if (nextValue.trim() !== '') {
      ensureDraftTimestamp();
    }
  };

  const handleObserverChange = (nextValue: string) => {
    setObserver(nextValue);
    if (nextValue.trim() !== '') {
      ensureDraftTimestamp();
    }
  };

  useEffect(() => {
    const allFieldsEmpty =
      kartNumber.trim() === '' &&
      turn.trim() === '' &&
      observer.trim() === '' &&
      infringement.trim() === '' &&
      penaltyDescription.trim() === '' &&
      secondKartNumber.trim() === '' &&
      lapNumber.trim() === '';

    if (allFieldsEmpty) {
      setDraftTimestamp(null);
      draftSession.current = null;
    }
  }, [kartNumber, turn, observer, infringement, penaltyDescription, secondKartNumber, lapNumber]);

  useEffect(() => {
    const handleGlobalTyping = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      if (isEditableElement(document.activeElement)) {
        return;
      }

      const nextChar = event.key;
      if (nextChar === ' ' && sanitizeKartInput(kartNumber) === '') {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      const input = kartInputRef.current;
      if (!input) {
        return;
      }

      const nextValue = sanitizeKartInput(`${kartNumber}${nextChar}`);
      setKartNumber(nextValue);
      input.focus();
      window.requestAnimationFrame(() => {
        const cursor = nextValue.length;
        input.setSelectionRange(cursor, cursor);
      });

      if (nextValue.trim() !== '') {
        ensureDraftTimestamp();
      }
    };

    window.addEventListener('keydown', handleGlobalTyping);
    return () => {
      window.removeEventListener('keydown', handleGlobalTyping);
    };
  }, [kartNumber, ensureDraftTimestamp]);

  useEffect(() => {
    const autoPenalty = getAutoPenaltyForInfringement(infringement);
    if (autoPenalty) {
      setPenaltyDescription(autoPenalty);
    }
  }, [infringement, isQualifyingMode, getAutoPenaltyForInfringement]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (kartTokens.length === 0 || hasInvalidKartTokens) {
      return;
    }

    const turnValue = turn.trim() === '' ? null : turn.trim();
    const observerValue = observer.trim() === '' ? null : observer.trim();
    const timestampToUse = draftTimestamp ?? new Date().toISOString();
    const parsedKarts = [...new Set(kartTokens.map((token) => Number(token.value)))];
    if (parsedKarts.some(k => !Number.isInteger(k) || k < 1 || k > 2147483647)) { setSubmitError('Kart numbers must be whole numbers between 1 and 2147483647.'); return; }

    // Format description for "Advantage by Contact" or "Contact" with second kart number
    let finalDescription: string | null = infringement.trim() === '' ? null : infringement;
    if (infringement && secondKartNumber.trim() !== '') {
      const parsedSecondKart = Number(secondKartNumber.trim());
      if (Number.isFinite(parsedSecondKart)) {
        if (infringement === 'Advantage by Contact') {
          finalDescription = `ABC over ${parsedSecondKart}`;
        } else if (infringement === 'Contact') {
          finalDescription = `Contact over ${parsedSecondKart}`;
        }
      }
    }

    // Format penalty_description for "Lap Invalidation" with lap number
    let finalPenaltyDescription: string | null = penaltyDescription.trim() === '' ? null : penaltyDescription;
    if (penaltyDescription === 'Lap Invalidation' && lapNumber.trim() !== '') {
      finalPenaltyDescription = `Lap Invalidation - Lap ${lapNumber.trim()}`;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      await onSubmit(
        parsedKarts.map((parsedKart) => ({
          kart_number: parsedKart,
          session_name: draftSession.current ?? sessionName,
          request_id: (() => {
            const key = JSON.stringify([draftSession.current, parsedKart, turnValue, finalDescription, observerValue, finalPenaltyDescription, timestampToUse]);
            if (!receipts.current.has(key)) receipts.current.set(key, crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join(''));
            return receipts.current.get(key)!;
          })(),
          turn_number: turnValue,
          description: finalDescription,
          observer: observerValue,
          penalty_description: finalPenaltyDescription,
          performed_by: observerValue || null,
          timestamp: timestampToUse,
        }))
      );

      setKartNumber('');
      setTurn('');
      setObserver('');
      setInfringement('');
      setPenaltyDescription('');
      setSecondKartNumber('');
      setLapNumber('');
      setDraftTimestamp(null);
      draftSession.current = null;
      receipts.current.clear();
    } catch (error) {
      if (error instanceof PartialSubmissionError) setKartNumber(error.remaining.map(p => p.kart_number).join(' '));
      setSubmitError(error instanceof Error ? error.message : 'Could not save. Your draft has been retained.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold">Log Infringement</CardTitle>
      </CardHeader>
      <CardContent className="pt-3 pb-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label htmlFor="kartNumber">Kart Number</Label>
              <Input
                id="kartNumber"
                type="text"
                ref={kartInputRef}
                value={kartNumber}
                onChange={(e) => handleKartNumberChange(e.target.value)}
                placeholder="e.g., 42 or 37 46"
                aria-invalid={hasInvalidKartTokens ? true : undefined}
                required
              />
              {kartTokens.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {kartTokens.map((token, index) => (
                    <Badge
                      key={`${token.value}-${index}`}
                      variant={token.isValid ? 'outline' : 'destructive'}
                      className="font-semibold"
                      style={token.isValid ? getKartTokenStyle(token.value) : undefined}
                    >
                      {token.value}
                    </Badge>
                  ))}
                </div>
              )}
              {hasInvalidKartTokens && (
                <p className="text-sm text-destructive">
                  Kart number tokens must be numeric only.
                </p>
              )}
            </div>

            <div className="space-y-3">
              <Label htmlFor="turn">Turn Number</Label>
              <Input
                id="turn"
                type="text"
                value={turn}
                onChange={(e) => handleTurnChange(e.target.value)}
                placeholder="e.g., 3"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="observer">Observer</Label>
            <Input
              id="observer"
              type="text"
              value={observer}
              onChange={(e) => handleObserverChange(e.target.value)}
              placeholder="Observer name (optional)"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between mb-0.5">
              <Label htmlFor="infringement">Infringement</Label>
              {infringement && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setInfringement('')}
                  className="h-auto py-1 px-2 text-xs"
                >
                  Clear
                </Button>
              )}
            </div>
            <Combobox
              id="infringement"
              options={INFRINGEMENT_OPTIONS}
              value={infringement}
              onValueChange={(value: string) => {
                setInfringement(value);
                if (value.trim() !== '') {
                  ensureDraftTimestamp();
                }
                // Clear second kart number if not "Advantage by Contact" or "Contact"
                if (value !== 'Advantage by Contact' && value !== 'Contact') {
                  setSecondKartNumber('');
                }
                const autoPenalty = getAutoPenaltyForInfringement(value);
                if (autoPenalty) {
                  setPenaltyDescription(autoPenalty);
                }
              }}
              placeholder="Select or type infringement type "
            />
          </div>

          {(infringement === 'Advantage by Contact' || infringement === 'Contact') && (
            <div className="space-y-3">
              <Label htmlFor="secondKartNumber">Other Kart Number (optional)</Label>
              <Input
                id="secondKartNumber"
                type="text"
                value={secondKartNumber}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setSecondKartNumber(nextValue);
                  if (nextValue.trim() !== '') {
                    ensureDraftTimestamp();
                  }
                }}
                placeholder="e.g., 15"
              />
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between mb-0.5">
              <Label htmlFor="penaltyDescription">Penalty Description</Label>
              {penaltyDescription && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPenaltyDescription('')}
                  className="h-auto py-1 px-2 text-xs"
                >
                  Clear
                </Button>
              )}
            </div>
            <Combobox
              id="penaltyDescription"
              options={PENALTY_OPTIONS}
              value={penaltyDescription}
              onValueChange={(value: string) => {
                setPenaltyDescription(value);
                if (value.trim() !== '') {
                  ensureDraftTimestamp();
                }
                // Clear lap number if not "Lap Invalidation"
                if (value !== 'Lap Invalidation') {
                  setLapNumber('');
                }
              }}
              placeholder="Select or type penalty type "
            />
          </div>

          {penaltyDescription === 'Lap Invalidation' && (
            <div className="space-y-3">
              <Label htmlFor="lapNumber">Lap Number</Label>
              <Input
                id="lapNumber"
                type="text"
                value={lapNumber}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setLapNumber(nextValue);
                  if (nextValue.trim() !== '') {
                    ensureDraftTimestamp();
                  }
                }}
                placeholder="e.g., 5"
              />
            </div>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || kartTokens.length === 0 || hasInvalidKartTokens}
            >
              {isSubmitting ? 'Logging...' : 'Log Infringement'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
