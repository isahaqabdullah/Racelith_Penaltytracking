import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Combobox } from './ui/combobox';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type { CreateInfringementPayload } from '../api';

const INFRINGEMENT_OPTIONS = [
  'White Line Infringement',
  'Pit Time Infringement',
  'Yellow Zone Infringement',
  'Track Limits',
  'Dangerous Driving',
  'Blocking',
  'Collision',
  'Unsafe Re-entry',
  'Ignoring Flags',
  'Pit Lane Speed',
  'Other',
];

const PENALTY_OPTIONS = [
  'Warning',
  '5 Sec',
  '10 Sec',
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!kartNumber || !turn || !observer || !infringement || !penaltyDescription) {
      return;
    }

    const parsedKart = Number(kartNumber);
    const turnNumber = turn === '' ? null : Number(turn);

    if (!Number.isFinite(parsedKart) || (turnNumber !== null && !Number.isFinite(turnNumber))) {
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        kart_number: parsedKart,
        turn_number: turnNumber,
        description: infringement,
        observer,
        penalty_description: penaltyDescription,
        performed_by: observer,
      });

      setKartNumber('');
      setTurn('');
      setObserver('');
      setInfringement('');
      setPenaltyDescription('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold">Log Infringement</CardTitle>
      </CardHeader>
      <CardContent className="pt-6 pb-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-5">
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

            <div className="space-y-5">
              <Label htmlFor="turn">Turn Number</Label>
              <Input
                id="turn"
                type="number"
                value={turn}
                onChange={(e) => setTurn(e.target.value)}
                placeholder="e.g., 3"
                required
              />
            </div>
          </div>

          <div className="space-y-5">
            <Label htmlFor="observer">Observer</Label>
            <Input
              id="observer"
              type="text"
              value={observer}
              onChange={(e) => setObserver(e.target.value)}
              placeholder="Observer name"
              required
            />
          </div>

          <div className="space-y-5">
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

          <div className="space-y-5">
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
