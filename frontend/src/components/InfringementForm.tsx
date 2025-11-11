import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type { CreateInfringementPayload } from '../api';

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
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
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

            <div className="space-y-2">
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

          <div className="space-y-2">
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

          <div className="space-y-2">
            <Label htmlFor="infringement">Infringement</Label>
            <Select value={infringement} onValueChange={setInfringement} required>
              <SelectTrigger id="infringement">
                <SelectValue placeholder="Select infringement type" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="White Line Infringement">White Line Infringement</SelectItem>
                  <SelectItem value="Yellow Zone Infringement">Yellow Zone Infringement</SelectItem>
                  <SelectItem value="Track Limits">Track Limits</SelectItem>
                  <SelectItem value="Dangerous Driving">Dangerous Driving</SelectItem>
                  <SelectItem value="Blocking">Blocking</SelectItem>
                  <SelectItem value="Collision">Collision</SelectItem>
                  <SelectItem value="Unsafe Re-entry">Unsafe Re-entry</SelectItem>
                  <SelectItem value="Ignoring Flags">Ignoring Flags</SelectItem>
                  <SelectItem value="Pit Lane Speed">Pit Lane Speed</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="penaltyDescription">Penalty Description</Label>
            <Select value={penaltyDescription} onValueChange={setPenaltyDescription} required>
              <SelectTrigger id="penaltyDescription">
                <SelectValue placeholder="Select penalty type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Warning">Warning</SelectItem>
                <SelectItem value="5 Sec">5 Sec</SelectItem>
                <SelectItem value="10 Sec">10 Sec</SelectItem>
                <SelectItem value="Stop and Go">Stop and Go</SelectItem>
                <SelectItem value="Drive Through">Drive Through</SelectItem>
                <SelectItem value="Time Penalty">Time Penalty</SelectItem>
                <SelectItem value="Disqualification">Disqualification</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full">
            {isSubmitting ? 'Logging...' : 'Log Infringement'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
