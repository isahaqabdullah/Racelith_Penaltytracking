import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Combobox } from './ui/combobox';
import type { UpdateInfringementPayload, InfringementRecord } from '../api';

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

interface EditInfringementDialogProps {
  infringement: InfringementRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: number, payload: UpdateInfringementPayload) => Promise<void> | void;
  isSaving?: boolean;
}

export function EditInfringementDialog({
  infringement,
  open,
  onOpenChange,
  onSave,
  isSaving = false,
}: EditInfringementDialogProps) {
  const [kartNumber, setKartNumber] = useState('');
  const [turn, setTurn] = useState('');
  const [observer, setObserver] = useState('');
  const [infringementType, setInfringementType] = useState('');
  const [penaltyDescription, setPenaltyDescription] = useState('');

  // Update form values when infringement changes
  useEffect(() => {
    if (infringement) {
      setKartNumber(String(infringement.kart_number));
      setTurn(
        infringement.turn_number === null || infringement.turn_number === undefined
          ? ''
          : String(infringement.turn_number)
      );
      setObserver(infringement.observer ?? '');
      setInfringementType(infringement.description);
      setPenaltyDescription(infringement.penalty_description ?? '');
    }
  }, [infringement]);

  const handleSave = async () => {
    if (!infringement || !kartNumber || !infringementType || !penaltyDescription) {
      return;
    }

    const parsedKart = Number(kartNumber);
    const turnNumber = turn === '' ? null : Number(turn);
    const observerValue = observer.trim() === '' ? null : observer.trim();

    if (!Number.isFinite(parsedKart) || (turnNumber !== null && !Number.isFinite(turnNumber))) {
      return;
    }

    await onSave(infringement.id, {
      kart_number: parsedKart,
      turn_number: turnNumber,
      description: infringementType,
      observer: observerValue,
      penalty_description: penaltyDescription,
      performed_by: observerValue || 'Race Control Operator',
    });
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  if (!infringement) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Infringement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-kartNumber">Kart Number</Label>
              <Input
                id="edit-kartNumber"
                type="text"
                value={kartNumber}
                onChange={(e) => setKartNumber(e.target.value)}
                placeholder="e.g., 42"
                required
              />
            </div>

            <div className="space-y-2">
            <Label htmlFor="edit-turn">Turn Number</Label>
              <Input
                id="edit-turn"
              type="number"
                value={turn}
                onChange={(e) => setTurn(e.target.value)}
              placeholder="e.g., 3"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-observer">Observer</Label>
            <Input
              id="edit-observer"
              type="text"
              value={observer}
              onChange={(e) => setObserver(e.target.value)}
              placeholder="Observer name (optional)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-infringement">Infringement</Label>
            <Combobox
              id="edit-infringement"
              options={INFRINGEMENT_OPTIONS}
              value={infringementType}
              onValueChange={(value: string) => {
                setInfringementType(value);
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

          <div className="space-y-2">
            <Label htmlFor="edit-penaltyDescription">Penalty Description</Label>
            <Combobox
              id="edit-penaltyDescription"
              options={PENALTY_OPTIONS}
              value={penaltyDescription}
              onValueChange={setPenaltyDescription}
              placeholder="Select or type penalty type"
              required
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
