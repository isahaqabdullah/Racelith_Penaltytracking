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
  const [secondKartNumber, setSecondKartNumber] = useState('');

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
      
      // Parse description to extract infringement type and second kart number
      const description = infringement.description || '';
      let baseInfringementType = description;
      let extractedSecondKart = '';
      
      // Check if description is in format "ABC over X" or "Contact over X"
      if (description && description.startsWith('ABC over ')) {
        baseInfringementType = 'Advantage by Contact';
        extractedSecondKart = description.replace('ABC over ', '');
      } else if (description && description.startsWith('Contact over ')) {
        baseInfringementType = 'Contact';
        extractedSecondKart = description.replace('Contact over ', '');
      }
      
      setInfringementType(baseInfringementType);
      setSecondKartNumber(extractedSecondKart);
      setPenaltyDescription(infringement.penalty_description ?? '');
    }
  }, [infringement]);

  const handleSave = async () => {
    // Only kart number is required
    if (!infringement || !kartNumber) {
      return;
    }

    const parsedKart = Number(kartNumber);
    const turnValue = turn.trim() === '' ? null : turn.trim();
    const observerValue = observer.trim() === '' ? null : observer.trim();

    if (!Number.isFinite(parsedKart)) {
      return;
    }

    // Format description for "Advantage by Contact" or "Contact" with second kart number
    let finalDescription: string | null = infringementType.trim() === '' ? null : infringementType;
    if (infringementType && secondKartNumber.trim() !== '') {
      const parsedSecondKart = Number(secondKartNumber.trim());
      if (Number.isFinite(parsedSecondKart)) {
        if (infringementType === 'Advantage by Contact') {
          finalDescription = `ABC over ${parsedSecondKart}`;
        } else if (infringementType === 'Contact') {
          finalDescription = `Contact over ${parsedSecondKart}`;
        }
      }
    }

    await onSave(infringement.id, {
      kart_number: parsedKart,
      turn_number: turnValue,
      description: finalDescription,
      observer: observerValue,
      penalty_description: penaltyDescription.trim() === '' ? null : penaltyDescription,
      performed_by: observerValue || null,
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
                type="text"
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
              forceBottom
              onValueChange={(value: string) => {
                setInfringementType(value);
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
              placeholder="Select or type infringement type (optional)"
            />
          </div>

          {(infringementType === 'Advantage by Contact' || infringementType === 'Contact') && (
            <div className="space-y-2">
              <Label htmlFor="edit-secondKartNumber">Other Kart Number (optional)</Label>
              <Input
                id="edit-secondKartNumber"
                type="text"
                value={secondKartNumber}
                onChange={(e) => setSecondKartNumber(e.target.value)}
                placeholder="e.g., 15"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-penaltyDescription">Penalty Description</Label>
            <Combobox
              id="edit-penaltyDescription"
              options={PENALTY_OPTIONS}
              value={penaltyDescription}
              forceBottom
              onValueChange={setPenaltyDescription}
              placeholder="Select or type penalty type (optional)"
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
