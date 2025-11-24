import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Combobox } from './ui/combobox';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type { CreateInfringementPayload } from '../api';

const INFRINGEMENT_OPTIONS = [
  'White Line Infringement',
  'Yellow Zone Infringement',
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
  'Stop and Go',
  'Drive Through',
  'Time Penalty',
  'Disqualification',
];

interface InfringementFormProps {
  onSubmit: (payload: CreateInfringementPayload) => Promise<void> | void;
}

export function InfringementForm({ onSubmit }: InfringementFormProps) {
  const [kartNumber, setKartNumber] = useState('');
  const [turn, setTurn] = useState('');
  const [observer, setObserver] = useState('');
  const [infringement, setInfringement] = useState('');
  const [penaltyDescription, setPenaltyDescription] = useState('');
  const [secondKartNumber, setSecondKartNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!kartNumber || !infringement || !penaltyDescription) {
      return;
    }

    const parsedKart = Number(kartNumber);
    const turnNumber = turn === '' ? null : Number(turn);
    const observerValue = observer.trim() === '' ? null : observer.trim();

    if (!Number.isFinite(parsedKart) || (turnNumber !== null && !Number.isFinite(turnNumber))) {
      return;
    }

    // Format description for "Advantage by Contact" or "Contact" with second kart number
    let finalDescription = infringement;
    if (secondKartNumber.trim() !== '') {
      const parsedSecondKart = Number(secondKartNumber.trim());
      if (Number.isFinite(parsedSecondKart)) {
        if (infringement === 'Advantage by Contact') {
          finalDescription = `ABC over ${parsedSecondKart}`;
        } else if (infringement === 'Contact') {
          finalDescription = `Contact over ${parsedSecondKart}`;
        }
      }
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        kart_number: parsedKart,
        turn_number: turnNumber,
        description: finalDescription,
        observer: observerValue,
        penalty_description: penaltyDescription,
        performed_by: observerValue || 'Race Control Operator',
      });

      setKartNumber('');
      setTurn('');
      setObserver('');
      setInfringement('');
      setPenaltyDescription('');
      setSecondKartNumber('');
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label htmlFor="kartNumber">Kart Number</Label>
              <Input
                id="kartNumber"
                type="text"
                value={kartNumber}
                onChange={(e) => setKartNumber(e.target.value)}
                placeholder="e.g., 42"
                required
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="turn">Turn Number</Label>
              <Input
                id="turn"
                type="number"
                value={turn}
                onChange={(e) => setTurn(e.target.value)}
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
              onChange={(e) => setObserver(e.target.value)}
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
                // Clear second kart number if not "Advantage by Contact" or "Contact"
                if (value !== 'Advantage by Contact' && value !== 'Contact') {
                  setSecondKartNumber('');
                }
                if (
                  value === 'White Line Infringement' ||
                  value === 'Yellow Zone Infringement'
                ) {
                  setPenaltyDescription('Warning');
                }
              }}
              placeholder="Select or type infringement type"
              required
            />
          </div>

          {(infringement === 'Advantage by Contact' || infringement === 'Contact') && (
            <div className="space-y-3">
              <Label htmlFor="secondKartNumber">Other Kart Number (optional)</Label>
              <Input
                id="secondKartNumber"
                type="text"
                value={secondKartNumber}
                onChange={(e) => setSecondKartNumber(e.target.value)}
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
              onValueChange={setPenaltyDescription}
              placeholder="Select or type penalty type"
              required
            />
          </div>

          <div className="pt-2">
            <Button type="submit" className="w-full">
              {isSubmitting ? 'Logging...' : 'Log Infringement'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
